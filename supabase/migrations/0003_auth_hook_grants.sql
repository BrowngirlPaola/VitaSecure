-- =============================================================================
-- 0003_auth_hook_grants.sql — make the custom access-token hook callable
--
-- For Supabase Auth to invoke public.custom_access_token_hook (defined in 0001),
-- the internal `supabase_auth_admin` role must be able to execute it and read the
-- profiles it looks up. Without these grants the hook silently fails and the
-- `user_role` claim never lands in the JWT — breaking RLS and the frontend.
--
-- After applying, enable the hook:
--   Hosted  → Dashboard ▸ Authentication ▸ Hooks ▸ Custom Access Token →
--             select public.custom_access_token_hook.
--   Local   → supabase/config.toml [auth.hook.custom_access_token] (see file).
-- =============================================================================

grant usage on schema public to supabase_auth_admin;

grant execute on function public.custom_access_token_hook(jsonb) to supabase_auth_admin;
revoke execute on function public.custom_access_token_hook(jsonb) from authenticated, anon, public;

-- The hook reads profiles.role for the user being minted a token.
grant select on table public.profiles to supabase_auth_admin;

drop policy if exists "auth admin can read profiles for hook" on public.profiles;
create policy "auth admin can read profiles for hook"
  on public.profiles for select
  to supabase_auth_admin
  using ( true );
