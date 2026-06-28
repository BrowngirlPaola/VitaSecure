// db.ts — Supabase clients for Edge Functions.
//
// adminClient(): SERVICE-ROLE client. Bypasses RLS — used for the clinical
// write/read pipeline (encrypt → insert; fetch → decrypt) and audit writes.
// Guard every use with an explicit authorization check first (see auth.ts).
//
// userClient(jwt): the caller's own client (RLS applies). Use for "can this user
// even see this?" checks that should honour RLS.

import { createClient, type SupabaseClient } from "jsr:@supabase/supabase-js@2";

const url = Deno.env.get("SUPABASE_URL")!;
const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const anonKey = Deno.env.get("SUPABASE_ANON_KEY")!;

export function adminClient(): SupabaseClient {
  return createClient(url, serviceKey, { auth: { persistSession: false } });
}

export function userClient(jwt: string): SupabaseClient {
  return createClient(url, anonKey, {
    auth: { persistSession: false },
    global: { headers: { Authorization: `Bearer ${jwt}` } },
  });
}
