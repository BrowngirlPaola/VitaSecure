/* env.example.js — template for runtime frontend config.
 *
 * Copy this file to `env.js` (same folder) and fill in your project's PUBLIC
 * keys. `env.js` is gitignored and loaded as a plain <script> before the app
 * modules, so js/config.js can read window.__ENV__.
 *
 * PUBLIC keys only — the anon key is safe in the browser (RLS + Edge Functions
 * enforce access). NEVER put the service-role key, AES key, or any Edge Function
 * secret here.
 */
window.__ENV__ = {
  SUPABASE_URL: 'https://YOUR-PROJECT-ref.supabase.co',
  SUPABASE_ANON_KEY: 'YOUR-ANON-KEY',
  // Optional; defaults to `${SUPABASE_URL}/functions/v1`.
  FUNCTIONS_URL: '',
};
