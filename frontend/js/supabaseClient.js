/* supabaseClient.js — Supabase client (auth + data layer).
 *
 * Single shared browser client. With Supabase Auth, the client automatically
 * attaches the signed-in user's JWT to every request, so:
 *   - RLS is keyed on auth.uid() / auth.jwt() ->> 'sub' (the user id), and
 *   - the user's role travels in the JWT (custom access token hook) and is also
 *     stored in the `profiles` table for the frontend to read (see auth.js).
 *
 * IMPORTANT: this client is the RLS-backstop path — lightweight, non-sensitive
 * reads only. It CANNOT decrypt clinical content (the AES key lives only in
 * Edge Function secrets). All clinical reads/writes go through api.js ->
 * Edge Functions (Directives §4.6).
 */

/* The Supabase SDK is imported LAZILY (dynamic import) rather than as a static
 * top-level import. Reason: the SDK is fetched from a CDN (esm.sh via the page
 * importmap) and a static import would put that network round-trip on the
 * critical path of EVERY page's module graph — including the demo shell, which
 * never uses Supabase. That made JS-rendered dashboards sit on "Loading…" until
 * the CDN responded. Loading it only when `getSupabase()` is first called (i.e.
 * only when configured) keeps the demo shell instant and offline-friendly. */
import { config, isConfigured } from './config.js';

let supabase = null;
let sdkPromise = null;

/**
 * Resolve the shared Supabase client, or null in demo mode (no keys).
 * Async because the SDK is loaded on demand from the CDN.
 * @returns {Promise<import('@supabase/supabase-js').SupabaseClient|null>}
 */
export async function getSupabase() {
  if (!isConfigured) return null;
  if (supabase) return supabase;

  if (!sdkPromise) sdkPromise = import('@supabase/supabase-js');
  const { createClient } = await sdkPromise;

  supabase = createClient(config.SUPABASE_URL, config.SUPABASE_ANON_KEY, {
    auth: {
      persistSession: true,
      autoRefreshToken: true,
      detectSessionInUrl: true, // handles email-confirm / magic-link redirects
    },
  });
  return supabase;
}
