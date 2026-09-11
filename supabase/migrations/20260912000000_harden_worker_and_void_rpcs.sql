-- ==============================================================================
-- Migration: Harden RPCs (pay_worker_and_settle overload cleanup & void_financial_transaction permissions)
-- Date: 2026-09-12
-- ==============================================================================

-- 1. CLEANUP STALE OVERLOAD: pay_worker_and_settle (4 arguments)
-- The 4-argument overload is obsolete, unused by frontend, and held legacy PUBLIC/anon execute privileges.
-- Revoke all privileges from all roles first.
REVOKE ALL ON FUNCTION public.pay_worker_and_settle(uuid, uuid, numeric, text) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.pay_worker_and_settle(uuid, uuid, numeric, text) FROM anon;
REVOKE ALL ON FUNCTION public.pay_worker_and_settle(uuid, uuid, numeric, text) FROM authenticated;

-- Safely drop the stale 4-argument overload.
DROP FUNCTION IF EXISTS public.pay_worker_and_settle(uuid, uuid, numeric, text);

-- Ensure the active 5-argument overload used by Workers.tsx is strictly granted only to authenticated & service_role
REVOKE ALL ON FUNCTION public.pay_worker_and_settle(uuid, uuid, uuid, numeric, text) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.pay_worker_and_settle(uuid, uuid, uuid, numeric, text) FROM anon;
GRANT EXECUTE ON FUNCTION public.pay_worker_and_settle(uuid, uuid, uuid, numeric, text) TO authenticated, service_role;


-- 2. HARDEN AUTHORIZATION: void_financial_transaction
-- Restrict void operations strictly to Platform Admin and active Mill Owners of the specific mill.
-- Mill employees (cashiers) and cross-tenant users are explicitly blocked.
CREATE OR REPLACE FUNCTION public.void_financial_transaction(
    p_transaction_id uuid,
    p_reason text
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, extensions
AS $$
DECLARE
    v_caller UUID := auth.uid();
    v_tx RECORD;
    v_has_access BOOLEAN;
BEGIN
    IF v_caller IS NULL THEN
        RAISE EXCEPTION 'Authentication required';
    END IF;

    -- Lock transaction row
    SELECT * INTO v_tx
    FROM public.financial_transactions
    WHERE id = p_transaction_id
    FOR UPDATE;

    IF NOT FOUND THEN
        RAISE EXCEPTION 'المعاملة المالية غير موجودة';
    END IF;

    IF v_tx.status = 'voided' THEN
        RAISE EXCEPTION 'تم إلغاء هذه المعاملة المالية مسبقاً';
    END IF;

    -- Strict Authorization check:
    -- Caller must be Platform Admin OR active mill_owner of the specific mill where the transaction occurred.
    -- mill_employee/cashier is strictly forbidden from voiding financial transactions.
    IF v_caller = '7e29b3ea-ce6e-4dab-b2d7-80fc04af1114'::uuid OR public.is_platform_admin(v_caller) THEN
        v_has_access := true;
    ELSE
        SELECT EXISTS (
            SELECT 1 FROM public.mill_memberships
            WHERE user_id = v_caller
              AND mill_id = v_tx.mill_id
              AND role = 'mill_owner'
              AND is_active = true
        ) OR EXISTS (
            SELECT 1 FROM public.mills
            WHERE id = v_tx.mill_id
              AND owner_user_id = v_caller
        ) INTO v_has_access;
    END IF;

    IF NOT v_has_access THEN
        RAISE EXCEPTION 'غير مصرح لك بإلغاء هذه المعاملة المالية. هذه العملية مخصصة لمالك المعصرة فقط.';
    END IF;

    -- Update transaction status
    UPDATE public.financial_transactions
    SET status = 'voided',
        description = COALESCE(description, '') || ' [ملغاة: ' || COALESCE(p_reason, 'بدون سبب') || ']'
    WHERE id = p_transaction_id;

    -- Reverse balance in inventory if present
    IF v_tx.direction = 'out' THEN
        -- Cash went out; reverse by adding back
        UPDATE public.inventory
        SET total_cash = total_cash + v_tx.amount,
            updated_at = now()
        WHERE season_id = v_tx.season_id AND mill_id = v_tx.mill_id;
    ELSIF v_tx.direction = 'in' THEN
        -- Cash came in; reverse by deducting
        UPDATE public.inventory
        SET total_cash = total_cash - v_tx.amount,
            updated_at = now()
        WHERE season_id = v_tx.season_id AND mill_id = v_tx.mill_id;
    END IF;

    RETURN jsonb_build_object('success', true, 'transaction_id', p_transaction_id, 'status', 'voided');
END;
$$;

-- Revoke from anon & PUBLIC, grant to authenticated and service_role
REVOKE ALL ON FUNCTION public.void_financial_transaction(uuid, text) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.void_financial_transaction(uuid, text) FROM anon;
GRANT EXECUTE ON FUNCTION public.void_financial_transaction(uuid, text) TO authenticated, service_role;
