/* api.js — Edge Function wrappers (Directives §3, §4.5–4.6).
 *
 * Every privileged / clinical operation goes through an Edge Function, never
 * directly to the DB. These thin wrappers use supabase.functions.invoke, which
 * attaches the signed-in user's JWT automatically. Client-facing errors stay
 * generic (Directives §4.10.2); detail lives in function logs.
 *
 * NOTE: the Edge Functions themselves are built in Increment 1+. Until they are
 * deployed, these calls fail at the network boundary — expected for the shell.
 * The contract (names, payloads) matches §4.5–4.6 exactly.
 */

import { getSupabase } from './supabaseClient.js';
import { isConfigured } from './config.js';

async function invoke(name, body) {
  if (!isConfigured) throw new Error('Backend not configured (demo shell).');
  const sb = await getSupabase();
  const { data, error } = await sb.functions.invoke(name, { body: body ?? {} });
  if (error) {
    // Keep the client message generic; the function logs hold the detail.
    throw new Error('The request could not be completed.');
  }
  // Every Edge Function wraps its payload in a { data } envelope (see
  // functions/_shared/http.ts `ok`). Unwrap it once here so callers get the
  // payload directly — e.g. verifyIntegrity() → { status, recordId, … } and
  // readRecord() → { fields, meta } — instead of res.data.status everywhere.
  return data?.data ?? data;
}

/** WRITE pipeline: encrypt → hash → anchor → audit (Directives §4.5). */
export const createRecord = (payload) => invoke('create-record', payload);

/** Authorize → fetch → decrypt → return (Directives §4.6.1). */
export const readRecord = (payload) => invoke('read-record', payload);

/** Re-hash and compare to the on-chain anchor → VERIFIED | TAMPERED (§4.6.3). */
export const verifyIntegrity = (payload) => invoke('verify-integrity', payload);

/** Admin: set role + anchor on the RBAC contract (Directives §3). */
export const assignRole = (payload) => invoke('assign-role', payload);

/** Patient: grant/revoke consent + anchor (Directives §3). */
export const consent = (payload) => invoke('consent', payload);
