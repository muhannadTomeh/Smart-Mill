-- Phase 0: canonical tenancy, platform authorization and Credential Vault hardening.
-- Additive/non-destructive: no business records or credentials are deleted.

create table if not exists public.credential_reveal_events (
  id uuid primary key default gen_random_uuid(),
  actor_user_id uuid not null references auth.users(id),
  target_user_id uuid not null references auth.users(id),
  credential_type text not null check (credential_type in ('account_password', 'admin_pin')),
  outcome text not null check (outcome in ('success', 'denied', 'rate_limited', 'missing', 'error')),
  created_at timestamptz not null default now()
);

create index if not exists credential_reveal_events_actor_created_idx
  on public.credential_reveal_events (actor_user_id, created_at desc);

alter table public.credential_reveal_events enable row level security;
drop policy if exists credential_reveal_events_platform_admin_select on public.credential_reveal_events;
create policy credential_reveal_events_platform_admin_select
  on public.credential_reveal_events for select to authenticated
  using (public.is_platform_admin(auth.uid()));
-- Only the Edge Function service client writes audit events.
revoke all on public.credential_reveal_events from anon, authenticated;

-- Credential ciphertext remains server-only even if table grants change later.
alter table public.credential_vault enable row level security;
drop policy if exists deny_all_credential_vault on public.credential_vault;
create policy deny_all_credential_vault on public.credential_vault
  for all to public using (false) with check (false);
revoke all on public.credential_vault from anon, authenticated;

-- Canonical helper: tenant membership is the authorization source, never owner_user_id or record user_id.
create or replace function public.has_active_mill_role(p_mill_id uuid, p_roles text[] default null)
returns boolean language sql stable security definer set search_path = public as $$
  select public.is_platform_admin(auth.uid()) or exists (
    select 1 from public.mill_memberships mm
    where mm.mill_id = p_mill_id
      and mm.user_id = auth.uid()
      and mm.is_active = true
      and (p_roles is null or mm.role = any(p_roles))
  );
$$;
revoke all on function public.has_active_mill_role(uuid, text[]) from public, anon;
grant execute on function public.has_active_mill_role(uuid, text[]) to authenticated;

-- Remove legacy user-id policies that can widen tenant access; retain all data.
drop policy if exists "Mill members access daily_inventory" on public.daily_inventory;
drop policy if exists "Mill users manage daily_inventory" on public.daily_inventory;
drop policy if exists "Users can manage their own daily inventory" on public.daily_inventory;
create policy daily_inventory_owner_access on public.daily_inventory for all to authenticated
  using (public.has_active_mill_role(mill_id, array['mill_owner']))
  with check (public.has_active_mill_role(mill_id, array['mill_owner']));

drop policy if exists mill_members_manage_settings on public.settings;
create policy settings_owner_access on public.settings for all to authenticated
  using (public.has_active_mill_role(mill_id, array['mill_owner']))
  with check (public.has_active_mill_role(mill_id, array['mill_owner']));

-- SECURITY DEFINER helpers must not remain anonymously callable.
revoke all on function public.check_user_mill_access(uuid) from public, anon;
grant execute on function public.check_user_mill_access(uuid) to authenticated;
revoke all on function public.record_expense_v2(uuid, text, numeric, text, text, uuid, uuid, text, text) from public, anon;
grant execute on function public.record_expense_v2(uuid, text, numeric, text, text, uuid, uuid, text, text) to authenticated, service_role;
revoke all on function public.record_oil_transaction_atomic(uuid, text, numeric, numeric, text, text) from public, anon;
grant execute on function public.record_oil_transaction_atomic(uuid, text, numeric, numeric, text, text) to authenticated, service_role;
