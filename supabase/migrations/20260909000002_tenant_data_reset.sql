-- =============================================================================
-- SMART-MILL CONTROLLED TENANT DATA RESET (TRANSACTIONAL & SAFETY-GUARDED)
-- PLATFORM ADMIN PRESERVED: 7e29b3ea-ce6e-4dab-b2d7-80fc04af1114
-- SYSTEM CONFIG PRESERVED: system_settings
-- =============================================================================

DO $$
DECLARE
  v_admin_id CONSTANT uuid := '7e29b3ea-ce6e-4dab-b2d7-80fc04af1114'::uuid;
  v_pre_auth_count int;
  v_pre_profile_count int;
  v_pre_role_count int;
  v_post_auth_count int;
  v_post_profile_count int;
  v_post_role_count int;
BEGIN

  -- ---------------------------------------------------------------------------
  -- PRE-DELETION SAFETY CHECKS: ABORT IF PLATFORM ADMIN IS COMPROMISED
  -- ---------------------------------------------------------------------------
  SELECT count(*) INTO v_pre_auth_count FROM auth.users WHERE id = v_admin_id;
  IF v_pre_auth_count <> 1 THEN
    RAISE EXCEPTION 'PRE-RESET CHECK FAILED: Platform Admin user (%) not found in auth.users. Aborting transaction.', v_admin_id;
  END IF;

  SELECT count(*) INTO v_pre_profile_count FROM public.profiles WHERE user_id = v_admin_id;
  IF v_pre_profile_count <> 1 THEN
    RAISE EXCEPTION 'PRE-RESET CHECK FAILED: Platform Admin profile not found in public.profiles. Aborting transaction.';
  END IF;

  SELECT count(*) INTO v_pre_role_count FROM public.user_roles WHERE user_id = v_admin_id AND role = 'platform_admin';
  IF v_pre_role_count <> 1 THEN
    RAISE EXCEPTION 'PRE-RESET CHECK FAILED: Platform Admin role not found in public.user_roles. Aborting transaction.';
  END IF;

  -- ---------------------------------------------------------------------------
  -- TIER 1: LEAF OPERATIONAL & FINANCIAL TRANSACTIONS
  -- (Removes records with NO ACTION foreign keys to seasons.id and auth.users created_by/voided_by)
  -- ---------------------------------------------------------------------------
  DELETE FROM public.financial_transactions;
  DELETE FROM public.customer_payments;
  DELETE FROM public.daily_closings;
  DELETE FROM public.daily_inventory;
  DELETE FROM public.invoices;
  DELETE FROM public.work_records;
  DELETE FROM public.worker_payments;
  DELETE FROM public.oil_transactions;
  DELETE FROM public.expenses;
  DELETE FROM public.queue;
  DELETE FROM public.inventory;

  -- ---------------------------------------------------------------------------
  -- TIER 2: INTERMEDIATE ENTITY TABLES
  -- (Children of seasons and parents of Tier 1 records)
  -- ---------------------------------------------------------------------------
  DELETE FROM public.workers;
  DELETE FROM public.customers;
  DELETE FROM public.expense_categories;
  DELETE FROM public.container_types;

  -- ---------------------------------------------------------------------------
  -- TIER 3: MILL CONFIGURATION, SEASONS & VAULT
  -- (All NO ACTION dependencies on seasons.id are now cleared)
  -- ---------------------------------------------------------------------------
  DELETE FROM public.seasons;
  DELETE FROM public.settings;
  DELETE FROM public.subscription_payments;
  DELETE FROM public.credential_vault;
  DELETE FROM public.mill_memberships;

  -- ---------------------------------------------------------------------------
  -- TIER 4: MILL ROOT RECORDS
  -- (mills.owner_user_id column remains in schema)
  -- ---------------------------------------------------------------------------
  DELETE FROM public.mills;

  -- ---------------------------------------------------------------------------
  -- TIER 5: AUDIT LOG & NON-ADMIN TENANT ACCOUNTS
  -- (All NO ACTION FKs from created_by in Tier 1 are now gone)
  -- ---------------------------------------------------------------------------
  DELETE FROM public.admin_audit_log WHERE viewed_user_id <> v_admin_id OR viewed_user_id IS NULL;
  DELETE FROM public.user_roles WHERE user_id <> v_admin_id;
  DELETE FROM public.profiles WHERE user_id <> v_admin_id;
  DELETE FROM auth.users WHERE id <> v_admin_id;

  -- ---------------------------------------------------------------------------
  -- POST-DELETION SAFETY CHECKS: VERIFY PLATFORM ADMIN IS FULLY INTACT
  -- ---------------------------------------------------------------------------
  SELECT count(*) INTO v_post_auth_count FROM auth.users WHERE id = v_admin_id;
  IF v_post_auth_count <> 1 THEN
    RAISE EXCEPTION 'POST-RESET SAFETY VIOLATION: Platform Admin user was compromised. Rolling back entire transaction.';
  END IF;

  SELECT count(*) INTO v_post_profile_count FROM public.profiles WHERE user_id = v_admin_id;
  IF v_post_profile_count <> 1 THEN
    RAISE EXCEPTION 'POST-RESET SAFETY VIOLATION: Platform Admin profile was compromised. Rolling back entire transaction.';
  END IF;

  SELECT count(*) INTO v_post_role_count FROM public.user_roles WHERE user_id = v_admin_id AND role = 'platform_admin';
  IF v_post_role_count <> 1 THEN
    RAISE EXCEPTION 'POST-RESET SAFETY VIOLATION: Platform Admin role was compromised. Rolling back entire transaction.';
  END IF;

  -- Ensure Platform Admin profile active status
  UPDATE public.profiles
  SET is_active = true,
      subscription_status = 'active'
  WHERE user_id = v_admin_id;

END $$;
