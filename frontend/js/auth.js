/* auth.js — Supabase Auth helpers (replaces clerkClient.js).
 *
 * Responsibilities:
 *   - email/password sign-in + sign-up (FR-AUTH-1/2)
 *   - current session / user / access token
 *   - resolve the user's application ROLE from the `profiles` table
 *   - sign-out (FR-AUTH-6)
 *
 * Roles are stored in `profiles.role` (and mirrored into the JWT via a Supabase
 * custom access-token hook for RLS). The frontend reads the profile to decide
 * which dashboard to show — guard.js / RLS / the on-chain RBAC contract remain
 * the real enforcement layers.
 */

import { getSupabase } from './supabaseClient.js';
import { isValidRole } from './roles.js';

/** Current Supabase session (or null). */
export async function getSession() {
  const sb = await getSupabase();
  if (!sb) return null;
  const { data } = await sb.auth.getSession();
  return data.session ?? null;
}

/** Current authenticated user (or null). */
export async function currentUser() {
  const session = await getSession();
  return session?.user ?? null;
}

/** Raw JWT carried to Edge Functions / RLS. */
export async function getAccessToken() {
  const session = await getSession();
  return session?.access_token ?? null;
}

/**
 * The user's application role. Prefers the JWT claim (set by the custom access
 * token hook); falls back to a `profiles` lookup. Returns null if unknown.
 */
export async function currentRole() {
  const session = await getSession();
  if (!session) return null;

  // 1) JWT claim (preferred — what RLS reads)
  const claimRole = decodeRoleClaim(session.access_token);
  if (isValidRole(claimRole)) return claimRole;

  // 2) profiles table fallback
  const sb = await getSupabase();
  const { data, error } = await sb
    .from('profiles')
    .select('role')
    .eq('id', session.user.id)
    .single();
  if (error) return null;
  return isValidRole(data?.role) ? data.role : null;
}

/** Profile row for the current user (display name, role, etc.). */
export async function currentProfile() {
  const session = await getSession();
  if (!session) return null;
  const sb = await getSupabase();
  const { data } = await sb
    .from('profiles')
    .select('id, full_name, role, title')
    .eq('id', session.user.id)
    .single();
  return data ?? null;
}

export async function signIn(email, password) {
  const sb = await getSupabase();
  if (!sb) throw new Error('Backend not configured (demo shell).');
  const { data, error } = await sb.auth.signInWithPassword({ email, password });
  if (error) throw error;
  return data;
}

export async function signUp(email, password, metadata = {}) {
  const sb = await getSupabase();
  if (!sb) throw new Error('Backend not configured (demo shell).');
  // full_name / requested role carried in user_metadata; a DB trigger creates
  // the matching profiles row. Admins approve/assign the authoritative role.
  const { data, error } = await sb.auth.signUp({
    email,
    password,
    options: { data: metadata },
  });
  if (error) throw error;
  return data;
}

export async function signOut() {
  const sb = await getSupabase();
  await sb?.auth.signOut();
}

/** Subscribe to auth state changes (sign-in/out). Returns an unsubscribe fn.
 * The client now loads asynchronously, so subscription is wired up once it's
 * ready; the returned unsubscribe stays synchronous and cancels either way. */
export function onAuthChange(callback) {
  let unsubscribe = () => {};
  let cancelled = false;
  getSupabase().then((sb) => {
    if (!sb || cancelled) return;
    const { data } = sb.auth.onAuthStateChange((_event, session) => callback(session));
    unsubscribe = () => data.subscription.unsubscribe();
  });
  return () => { cancelled = true; unsubscribe(); };
}

function decodeRoleClaim(jwt) {
  try {
    const payload = JSON.parse(atob(jwt.split('.')[1]));
    // Supabase custom claims may sit at top-level or under app_metadata.
    return payload.user_role ?? payload.role ?? payload.app_metadata?.role ?? null;
  } catch {
    return null;
  }
}
