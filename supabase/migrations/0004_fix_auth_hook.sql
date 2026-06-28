-- =============================================================================
-- 0004_fix_auth_hook.sql — make the access-token hook run reliably.
--
-- GoTrue invokes the hook as `supabase_auth_admin`, which is NOT a superuser and
-- does not bypass RLS. A plain (SECURITY INVOKER) hook then depends on that role
-- having table/type/schema privileges on everything it touches — fragile, and
-- the cause of "Error running hook URI" 500s on signup.
--
-- Redefine it as SECURITY DEFINER with a pinned search_path so it executes with
-- the owner's privileges (reads profiles regardless of RLS/grants). supabase_auth
-- _admin only needs EXECUTE, which we (re)grant below.
-- =============================================================================

create or replace function public.custom_access_token_hook(event jsonb)
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  claims jsonb;
  v_role app_role;
begin
  select role into v_role from public.profiles where id = (event ->> 'user_id')::uuid;
  claims := coalesce(event -> 'claims', '{}'::jsonb);
  if v_role is not null then
    claims := jsonb_set(claims, '{user_role}', to_jsonb(v_role::text));
  end if;
  return jsonb_set(event, '{claims}', claims);
end $$;

grant execute on function public.custom_access_token_hook(jsonb) to supabase_auth_admin;
revoke execute on function public.custom_access_token_hook(jsonb) from authenticated, anon, public;
