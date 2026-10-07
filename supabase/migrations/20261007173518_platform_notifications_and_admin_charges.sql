-- Platform notifications and platform-level mill charges.
-- These charges are intentionally separate from each mill's operational ledger.

CREATE TABLE public.app_notifications (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  recipient_user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  mill_id uuid NULL REFERENCES public.mills(id) ON DELETE SET NULL,
  title text NOT NULL,
  message text NOT NULL,
  category text NOT NULL DEFAULT 'general',
  action_url text NULL,
  source_type text NULL,
  source_id uuid NULL,
  batch_id uuid NOT NULL DEFAULT gen_random_uuid(),
  created_by uuid NOT NULL REFERENCES auth.users(id) ON DELETE RESTRICT,
  created_at timestamptz NOT NULL DEFAULT now(),
  read_at timestamptz NULL,
  CONSTRAINT app_notifications_title_check
    CHECK (char_length(trim(title)) BETWEEN 1 AND 120),
  CONSTRAINT app_notifications_message_check
    CHECK (char_length(trim(message)) BETWEEN 1 AND 2000),
  CONSTRAINT app_notifications_category_check
    CHECK (category IN ('general', 'payment_due', 'update')),
  CONSTRAINT app_notifications_action_url_check
    CHECK (action_url IS NULL OR (char_length(action_url) <= 500 AND action_url LIKE '/%')),
  CONSTRAINT app_notifications_batch_recipient_key UNIQUE (batch_id, recipient_user_id)
);

CREATE INDEX app_notifications_recipient_created_idx
  ON public.app_notifications (recipient_user_id, created_at DESC);

CREATE INDEX app_notifications_recipient_unread_idx
  ON public.app_notifications (recipient_user_id, created_at DESC)
  WHERE read_at IS NULL;

ALTER TABLE public.app_notifications ENABLE ROW LEVEL SECURITY;

CREATE POLICY app_notifications_select_own
ON public.app_notifications
FOR SELECT
TO authenticated
USING ((SELECT auth.uid()) = recipient_user_id);

REVOKE ALL ON TABLE public.app_notifications FROM PUBLIC, anon, authenticated;
GRANT SELECT ON TABLE public.app_notifications TO authenticated;
GRANT ALL ON TABLE public.app_notifications TO service_role;

CREATE TABLE public.mill_admin_charges (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  mill_id uuid NOT NULL REFERENCES public.mills(id) ON DELETE RESTRICT,
  title text NOT NULL,
  amount numeric(14, 2) NOT NULL,
  due_date date NULL,
  notes text NULL,
  status text NOT NULL DEFAULT 'outstanding',
  idempotency_key uuid NOT NULL DEFAULT gen_random_uuid(),
  created_by uuid NOT NULL REFERENCES auth.users(id) ON DELETE RESTRICT,
  created_at timestamptz NOT NULL DEFAULT now(),
  settled_by uuid NULL REFERENCES auth.users(id) ON DELETE RESTRICT,
  settled_at timestamptz NULL,
  CONSTRAINT mill_admin_charges_title_check
    CHECK (char_length(trim(title)) BETWEEN 1 AND 120),
  CONSTRAINT mill_admin_charges_amount_check CHECK (amount > 0),
  CONSTRAINT mill_admin_charges_notes_check
    CHECK (notes IS NULL OR char_length(notes) <= 2000),
  CONSTRAINT mill_admin_charges_status_check
    CHECK (status IN ('outstanding', 'paid', 'cancelled')),
  CONSTRAINT mill_admin_charges_idempotency_key UNIQUE (idempotency_key),
  CONSTRAINT mill_admin_charges_settlement_check CHECK (
    (status = 'outstanding' AND settled_by IS NULL AND settled_at IS NULL)
    OR
    (status IN ('paid', 'cancelled') AND settled_by IS NOT NULL AND settled_at IS NOT NULL)
  )
);

CREATE INDEX mill_admin_charges_mill_status_idx
  ON public.mill_admin_charges (mill_id, status, created_at DESC);

ALTER TABLE public.mill_admin_charges ENABLE ROW LEVEL SECURITY;

CREATE POLICY mill_admin_charges_platform_admin_select
ON public.mill_admin_charges
FOR SELECT
TO authenticated
USING ((SELECT public.is_platform_admin((SELECT auth.uid()))));

REVOKE ALL ON TABLE public.mill_admin_charges FROM PUBLIC, anon, authenticated;
GRANT SELECT ON TABLE public.mill_admin_charges TO authenticated;
GRANT ALL ON TABLE public.mill_admin_charges TO service_role;

CREATE OR REPLACE FUNCTION public.send_notification_command(
  p_scope text,
  p_recipient_user_id uuid,
  p_title text,
  p_message text,
  p_category text,
  p_action_url text,
  p_idempotency_key uuid
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $function$
DECLARE
  v_actor uuid := auth.uid();
  v_scope text := lower(trim(COALESCE(p_scope, '')));
  v_category text := lower(trim(COALESCE(p_category, 'general')));
  v_count integer := 0;
BEGIN
  IF v_actor IS NULL OR NOT public.is_platform_admin(v_actor) THEN
    RAISE EXCEPTION USING ERRCODE = '42501', MESSAGE = 'PLATFORM_ADMIN_REQUIRED';
  END IF;

  IF v_scope NOT IN ('all', 'user') THEN
    RAISE EXCEPTION USING ERRCODE = '22023', MESSAGE = 'INVALID_NOTIFICATION_SCOPE';
  END IF;

  IF v_scope = 'user' AND p_recipient_user_id IS NULL THEN
    RAISE EXCEPTION USING ERRCODE = '22023', MESSAGE = 'NOTIFICATION_RECIPIENT_REQUIRED';
  END IF;

  IF char_length(trim(COALESCE(p_title, ''))) NOT BETWEEN 1 AND 120 THEN
    RAISE EXCEPTION USING ERRCODE = '22023', MESSAGE = 'INVALID_NOTIFICATION_TITLE';
  END IF;

  IF char_length(trim(COALESCE(p_message, ''))) NOT BETWEEN 1 AND 2000 THEN
    RAISE EXCEPTION USING ERRCODE = '22023', MESSAGE = 'INVALID_NOTIFICATION_MESSAGE';
  END IF;

  IF v_category NOT IN ('general', 'payment_due', 'update') THEN
    RAISE EXCEPTION USING ERRCODE = '22023', MESSAGE = 'INVALID_NOTIFICATION_CATEGORY';
  END IF;

  IF p_action_url IS NOT NULL
     AND (char_length(p_action_url) > 500 OR p_action_url NOT LIKE '/%') THEN
    RAISE EXCEPTION USING ERRCODE = '22023', MESSAGE = 'INVALID_NOTIFICATION_ACTION_URL';
  END IF;

  IF p_idempotency_key IS NULL THEN
    RAISE EXCEPTION USING ERRCODE = '22023', MESSAGE = 'IDEMPOTENCY_KEY_REQUIRED';
  END IF;

  INSERT INTO public.app_notifications (
    recipient_user_id,
    mill_id,
    title,
    message,
    category,
    action_url,
    batch_id,
    created_by
  )
  SELECT
    recipients.user_id,
    recipients.mill_id,
    trim(p_title),
    trim(p_message),
    v_category,
    NULLIF(trim(COALESCE(p_action_url, '')), ''),
    p_idempotency_key,
    v_actor
  FROM (
    SELECT DISTINCT ON (p.user_id)
      p.user_id,
      COALESCE(mm.mill_id, owner_mill.id) AS mill_id
    FROM public.profiles p
    LEFT JOIN public.mill_memberships mm
      ON mm.user_id = p.user_id
     AND mm.is_active = true
    LEFT JOIN public.mills owner_mill
      ON owner_mill.owner_user_id = p.user_id
    WHERE p.is_active = true
      AND (
        (v_scope = 'all' AND p.user_id <> v_actor)
        OR
        (v_scope = 'user' AND p.user_id = p_recipient_user_id)
      )
    ORDER BY p.user_id, mm.created_at DESC NULLS LAST
  ) AS recipients
  ON CONFLICT (batch_id, recipient_user_id) DO NOTHING;

  GET DIAGNOSTICS v_count = ROW_COUNT;

  IF v_scope = 'user' AND v_count = 0 AND NOT EXISTS (
    SELECT 1
    FROM public.app_notifications n
    WHERE n.batch_id = p_idempotency_key
      AND n.recipient_user_id = p_recipient_user_id
  ) THEN
    RAISE EXCEPTION USING ERRCODE = 'P0002', MESSAGE = 'NOTIFICATION_RECIPIENT_NOT_FOUND';
  END IF;

  IF v_count = 0 THEN
    SELECT count(*)::integer INTO v_count
    FROM public.app_notifications n
    WHERE n.batch_id = p_idempotency_key;
  END IF;

  RETURN jsonb_build_object(
    'batch_id', p_idempotency_key,
    'delivered_count', v_count
  );
END;
$function$;

CREATE OR REPLACE FUNCTION public.mark_notification_read_command(
  p_notification_id uuid
)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $function$
DECLARE
  v_updated integer;
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION USING ERRCODE = '42501', MESSAGE = 'AUTHENTICATION_REQUIRED';
  END IF;

  UPDATE public.app_notifications
  SET read_at = COALESCE(read_at, now())
  WHERE id = p_notification_id
    AND recipient_user_id = auth.uid();

  GET DIAGNOSTICS v_updated = ROW_COUNT;
  RETURN v_updated > 0;
END;
$function$;

CREATE OR REPLACE FUNCTION public.mark_all_notifications_read_command()
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $function$
DECLARE
  v_updated integer;
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION USING ERRCODE = '42501', MESSAGE = 'AUTHENTICATION_REQUIRED';
  END IF;

  UPDATE public.app_notifications
  SET read_at = now()
  WHERE recipient_user_id = auth.uid()
    AND read_at IS NULL;

  GET DIAGNOSTICS v_updated = ROW_COUNT;
  RETURN v_updated;
END;
$function$;

CREATE OR REPLACE FUNCTION public.create_mill_admin_charge_command(
  p_mill_id uuid,
  p_title text,
  p_amount numeric,
  p_due_date date,
  p_notes text,
  p_notify boolean,
  p_idempotency_key uuid
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $function$
DECLARE
  v_actor uuid := auth.uid();
  v_charge public.mill_admin_charges%ROWTYPE;
  v_mill public.mills%ROWTYPE;
  v_notified integer := 0;
BEGIN
  IF v_actor IS NULL OR NOT public.is_platform_admin(v_actor) THEN
    RAISE EXCEPTION USING ERRCODE = '42501', MESSAGE = 'PLATFORM_ADMIN_REQUIRED';
  END IF;

  IF char_length(trim(COALESCE(p_title, ''))) NOT BETWEEN 1 AND 120 THEN
    RAISE EXCEPTION USING ERRCODE = '22023', MESSAGE = 'INVALID_ADMIN_CHARGE_TITLE';
  END IF;

  IF p_amount IS NULL OR p_amount <= 0 THEN
    RAISE EXCEPTION USING ERRCODE = '22023', MESSAGE = 'INVALID_ADMIN_CHARGE_AMOUNT';
  END IF;

  IF char_length(COALESCE(p_notes, '')) > 2000 THEN
    RAISE EXCEPTION USING ERRCODE = '22023', MESSAGE = 'INVALID_ADMIN_CHARGE_NOTES';
  END IF;

  IF p_idempotency_key IS NULL THEN
    RAISE EXCEPTION USING ERRCODE = '22023', MESSAGE = 'IDEMPOTENCY_KEY_REQUIRED';
  END IF;

  SELECT * INTO v_charge
  FROM public.mill_admin_charges
  WHERE idempotency_key = p_idempotency_key;

  IF v_charge.id IS NOT NULL THEN
    IF v_charge.mill_id IS DISTINCT FROM p_mill_id THEN
      RAISE EXCEPTION USING ERRCODE = '23505', MESSAGE = 'IDEMPOTENCY_KEY_CONFLICT';
    END IF;

    RETURN jsonb_build_object(
      'charge_id', v_charge.id,
      'mill_id', v_charge.mill_id,
      'status', v_charge.status,
      'notified_count', 0,
      'duplicate', true
    );
  END IF;

  SELECT * INTO v_mill
  FROM public.mills
  WHERE id = p_mill_id;

  IF v_mill.id IS NULL THEN
    RAISE EXCEPTION USING ERRCODE = 'P0002', MESSAGE = 'MILL_NOT_FOUND';
  END IF;

  INSERT INTO public.mill_admin_charges (
    mill_id,
    title,
    amount,
    due_date,
    notes,
    idempotency_key,
    created_by
  ) VALUES (
    v_mill.id,
    trim(p_title),
    p_amount,
    p_due_date,
    NULLIF(trim(COALESCE(p_notes, '')), ''),
    p_idempotency_key,
    v_actor
  )
  RETURNING * INTO v_charge;

  IF COALESCE(p_notify, true) THEN
    INSERT INTO public.app_notifications (
      recipient_user_id,
      mill_id,
      title,
      message,
      category,
      action_url,
      source_type,
      source_id,
      batch_id,
      created_by
    )
    SELECT
      recipients.user_id,
      v_mill.id,
      'استحقاق مالي جديد: ' || v_charge.title,
      'تم تسجيل مبلغ مستحق بقيمة ' || trim(to_char(v_charge.amount, 'FM999999999990.00')) || ' ₪'
        || CASE WHEN v_charge.due_date IS NOT NULL THEN '، تاريخ الاستحقاق ' || to_char(v_charge.due_date, 'YYYY-MM-DD') ELSE '' END,
      'payment_due',
      '/notifications',
      'mill_admin_charge',
      v_charge.id,
      p_idempotency_key,
      v_actor
    FROM (
      SELECT DISTINCT user_id
      FROM (
        SELECT v_mill.owner_user_id AS user_id
        UNION ALL
        SELECT mm.user_id
        FROM public.mill_memberships mm
        WHERE mm.mill_id = v_mill.id
          AND mm.role = 'mill_owner'
          AND mm.is_active = true
      ) owner_accounts
      WHERE user_id IS NOT NULL
    ) recipients
    ON CONFLICT (batch_id, recipient_user_id) DO NOTHING;

    GET DIAGNOSTICS v_notified = ROW_COUNT;
  END IF;

  RETURN jsonb_build_object(
    'charge_id', v_charge.id,
    'mill_id', v_charge.mill_id,
    'status', v_charge.status,
    'notified_count', v_notified,
    'duplicate', false
  );
END;
$function$;

CREATE OR REPLACE FUNCTION public.update_mill_admin_charge_status_command(
  p_charge_id uuid,
  p_status text
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $function$
DECLARE
  v_actor uuid := auth.uid();
  v_status text := lower(trim(COALESCE(p_status, '')));
  v_charge public.mill_admin_charges%ROWTYPE;
BEGIN
  IF v_actor IS NULL OR NOT public.is_platform_admin(v_actor) THEN
    RAISE EXCEPTION USING ERRCODE = '42501', MESSAGE = 'PLATFORM_ADMIN_REQUIRED';
  END IF;

  IF v_status NOT IN ('paid', 'cancelled') THEN
    RAISE EXCEPTION USING ERRCODE = '22023', MESSAGE = 'INVALID_ADMIN_CHARGE_STATUS';
  END IF;

  SELECT * INTO v_charge
  FROM public.mill_admin_charges
  WHERE id = p_charge_id
  FOR UPDATE;

  IF v_charge.id IS NULL THEN
    RAISE EXCEPTION USING ERRCODE = 'P0002', MESSAGE = 'ADMIN_CHARGE_NOT_FOUND';
  END IF;

  IF v_charge.status <> 'outstanding' THEN
    RAISE EXCEPTION USING ERRCODE = '23514', MESSAGE = 'ADMIN_CHARGE_ALREADY_CLOSED';
  END IF;

  UPDATE public.mill_admin_charges
  SET status = v_status,
      settled_by = v_actor,
      settled_at = now()
  WHERE id = v_charge.id
  RETURNING * INTO v_charge;

  RETURN jsonb_build_object(
    'charge_id', v_charge.id,
    'mill_id', v_charge.mill_id,
    'status', v_charge.status
  );
END;
$function$;

REVOKE ALL ON FUNCTION public.send_notification_command(text, uuid, text, text, text, text, uuid)
  FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.mark_notification_read_command(uuid)
  FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.mark_all_notifications_read_command()
  FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.create_mill_admin_charge_command(uuid, text, numeric, date, text, boolean, uuid)
  FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.update_mill_admin_charge_status_command(uuid, text)
  FROM PUBLIC, anon, authenticated;

GRANT EXECUTE ON FUNCTION public.send_notification_command(text, uuid, text, text, text, text, uuid)
  TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.mark_notification_read_command(uuid)
  TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.mark_all_notifications_read_command()
  TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.create_mill_admin_charge_command(uuid, text, numeric, date, text, boolean, uuid)
  TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.update_mill_admin_charge_status_command(uuid, text)
  TO authenticated, service_role;

DO $publication$
BEGIN
  IF EXISTS (
    SELECT 1 FROM pg_publication WHERE pubname = 'supabase_realtime'
  ) AND NOT EXISTS (
    SELECT 1
    FROM pg_publication_tables
    WHERE pubname = 'supabase_realtime'
      AND schemaname = 'public'
      AND tablename = 'app_notifications'
  ) THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.app_notifications;
  END IF;
END
$publication$;
