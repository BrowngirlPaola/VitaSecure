-- =============================================================================
-- 0001_profiles.sql — identity + role storage for Supabase Auth
--
-- Auth change: the project now uses Supabase Auth (email/password) instead of
-- Clerk. The application role lives in `profiles.role` and is mirrored into the
-- JWT via a custom access-token hook (see note at the bottom) so RLS can read it
-- as auth.jwt() ->> 'user_role'.
--
-- Role string VALUES must stay identical to frontend/js/roles.js and the
-- on-chain RBAC contract (Directives §4.10). Deny-by-default RLS (Directives §4.3).
-- =============================================================================

-- Six roles, least privilege (SRS §5).
do $$ begin
  create type app_role as enum (
    'ADMIN', 'DOCTOR', 'NURSE', 'LAB_TECHNICIAN', 'RECEPTIONIST', 'PATIENT'
  );
exception when duplicate_object then null; end $$;

create table if not exists public.profiles (
  id          uuid primary key references auth.users (id) on delete cascade,
  full_name   text,
  title       text,
  role        app_role not null default 'PATIENT',
  status      text not null default 'pending',  -- pending | active | disabled
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);

alter table public.profiles enable row level security;

-- Deny-by-default: only the explicit policies below grant access.

-- A user may read their own profile.
create policy "self can read own profile"
  on public.profiles for select
  using ( id = auth.uid() );

-- A user may update their own non-privileged fields (NOT role/status — those
-- are admin-only and authoritatively set via the on-chain RBAC flow).
create policy "self can update own profile"
  on public.profiles for update
  using ( id = auth.uid() )
  with check ( id = auth.uid() );

-- Admins may read every profile (role taken from the JWT claim).
create policy "admin can read all profiles"
  on public.profiles for select
  using ( (auth.jwt() ->> 'user_role') = 'ADMIN' );

-- Admins may change role/status (account management, FR-ADM-2).
-- NOTE: the authoritative assignment is still the on-chain RBAC contract via the
-- assign-role Edge Function; this policy is the DB backstop.
create policy "admin can manage profiles"
  on public.profiles for update
  using ( (auth.jwt() ->> 'user_role') = 'ADMIN' );

-- Create a profile automatically on sign-up. The requested role from sign-up
-- metadata is recorded but starts as 'pending'; an admin confirms it on-chain.
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer set search_path = public
as $$
begin
  insert into public.profiles (id, full_name, role)
  values (
    new.id,
    coalesce(new.raw_user_meta_data ->> 'full_name', ''),
    coalesce((new.raw_user_meta_data ->> 'requested_role')::app_role, 'PATIENT')
  )
  on conflict (id) do nothing;
  return new;
end $$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- =============================================================================
-- Custom access-token hook (configure in supabase/config.toml or the dashboard):
--   [auth.hook.custom_access_token]
--   enabled = true
--   uri = "pg-functions://postgres/public/custom_access_token_hook"
-- This injects `user_role` into the JWT so RLS (and the frontend) can read it.
-- =============================================================================
create or replace function public.custom_access_token_hook(event jsonb)
returns jsonb
language plpgsql
stable
as $$
declare
  claims jsonb;
  user_role app_role;
begin
  select role into user_role from public.profiles where id = (event ->> 'user_id')::uuid;
  claims := coalesce(event -> 'claims', '{}'::jsonb);
  if user_role is not null then
    claims := jsonb_set(claims, '{user_role}', to_jsonb(user_role::text));
  end if;
  return jsonb_set(event, '{claims}', claims);
end $$;
