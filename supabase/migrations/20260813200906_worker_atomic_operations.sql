-- 1. Function to pay worker and update inventory
CREATE OR REPLACE FUNCTION public.pay_worker_and_settle(
    p_user_id UUID,
    p_season_id UUID,
    p_worker_id UUID,
    p_amount NUMERIC,
    p_notes TEXT
)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_total_earned NUMERIC;
    v_total_paid NUMERIC;
    v_cash_balance NUMERIC;
BEGIN
    -- Check worker balance
    SELECT total_earned, total_paid INTO v_total_earned, v_total_paid
    FROM public.workers
    WHERE id = p_worker_id AND user_id = p_user_id AND season_id = p_season_id;

    IF NOT FOUND THEN
        RAISE EXCEPTION 'العامل غير موجود';
    END IF;

    IF p_amount > (v_total_earned - v_total_paid) THEN
        RAISE EXCEPTION 'المبلغ أكبر من الرصيد المستحق';
    END IF;

    -- Check inventory cash
    SELECT total_cash INTO v_cash_balance
    FROM public.inventory
    WHERE user_id = p_user_id AND season_id = p_season_id;

    IF v_cash_balance < p_amount THEN
        RAISE EXCEPTION 'رصيد الصندوق غير كافٍ';
    END IF;

    -- 1. Insert payment record
    INSERT INTO public.worker_payments (user_id, season_id, worker_id, amount, notes)
    VALUES (p_user_id, p_season_id, p_worker_id, p_amount, p_notes);

    -- 2. Update worker total_paid
    UPDATE public.workers
    SET total_paid = total_paid + p_amount
    WHERE id = p_worker_id;

    -- 3. Update inventory total_cash
    UPDATE public.inventory
    SET total_cash = total_cash - p_amount
    WHERE user_id = p_user_id AND season_id = p_season_id;
END;
$$;

-- 2. Function to register work and update worker earnings
CREATE OR REPLACE FUNCTION public.register_worker_session(
    p_user_id UUID,
    p_season_id UUID,
    p_worker_id UUID,
    p_val NUMERIC,
    p_notes TEXT
)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_type TEXT;
    v_hourly_rate NUMERIC;
    v_shift_rate NUMERIC;
    v_amount NUMERIC;
BEGIN
    -- Get worker info
    SELECT type, hourly_rate, shift_rate INTO v_type, v_hourly_rate, v_shift_rate
    FROM public.workers
    WHERE id = p_worker_id AND user_id = p_user_id AND season_id = p_season_id;

    IF NOT FOUND THEN
        RAISE EXCEPTION 'العامل غير موجود';
    END IF;

    -- Calculate amount
    IF v_type = 'hourly' THEN
        v_amount := p_val * COALESCE(v_hourly_rate, 0);
    ELSE
        v_amount := p_val * COALESCE(v_shift_rate, 0);
    END IF;

    -- 1. Insert work record
    INSERT INTO public.work_records (
        user_id, season_id, worker_id, amount, notes, 
        hours, shifts
    )
    VALUES (
        p_user_id, p_season_id, p_worker_id, v_amount, p_notes,
        CASE WHEN v_type = 'hourly' THEN p_val ELSE NULL END,
        CASE WHEN v_type = 'shift' THEN p_val ELSE NULL END
    );

    -- 2. Update worker total_earned
    UPDATE public.workers
    SET total_earned = total_earned + v_amount
    WHERE id = p_worker_id;
END;
$$;

-- Grant execute permissions
GRANT EXECUTE ON FUNCTION public.pay_worker_and_settle TO authenticated;
GRANT EXECUTE ON FUNCTION public.register_worker_session TO authenticated;
