/* config.js — frontend runtime configuration (Directives §4.1).
 *
 * PUBLIC keys only (Supabase project URL + anon key). NEVER put the AES key,
 * chain signer key, or any Edge Function secret here — those live only in
 * Supabase secrets.
 *
 * Auth note: this project uses **Supabase Auth** (email/password) directly.
 * (Clerk has been removed — see CLAUDE.md auth section.)
 *
 * Set values at deploy time via window.__ENV__ (e.g. an inline <script> or a
 * generated env.js). Empty strings keep the app in "demo shell" mode so the UI
 * is reviewable without a live backend.
 */

const env = (typeof window !== 'undefined' && window.__ENV__) || {};

export const config = {
  SUPABASE_URL: env.SUPABASE_URL ?? '',
  SUPABASE_ANON_KEY: env.SUPABASE_ANON_KEY ?? '',
  // Optional override; defaults to `${SUPABASE_URL}/functions/v1`.
  FUNCTIONS_URL: env.FUNCTIONS_URL ?? '',
};

/** True only when the minimum keys for live auth + data are present. */
export const isConfigured = Boolean(config.SUPABASE_URL && config.SUPABASE_ANON_KEY);

export function functionsBaseUrl() {
  if (config.FUNCTIONS_URL) return config.FUNCTIONS_URL.replace(/\/$/, '');
  if (config.SUPABASE_URL) return `${config.SUPABASE_URL.replace(/\/$/, '')}/functions/v1`;
  return '';
}
