# VitaSecure backend — Increment 1 setup

Wires Supabase Auth + Postgres/RLS + the AES-256-GCM Edge Function pipeline
(`create-record` / `read-record` / `verify-integrity`). **No blockchain yet** —
records are written, encrypted, hashed and integrity-checked off-chain; anchoring
arrives in Increment 2 (rows sit at `anchor_status = 'pending-anchor'` until then).

## 0. Prerequisites

You already have a hosted Supabase project. Get its **Project ref**, **Project
URL**, **anon key** (Dashboard ▸ Project Settings ▸ API). To deploy the Edge
Functions you need the **Supabase CLI** (migrations can also be pasted in the SQL
editor, but functions are multi-file → CLI is the practical route):

```bash
npm install -g supabase        # or: scoop install supabase / brew install supabase
supabase login
supabase link --project-ref <your-project-ref>
```

## 1. Apply the database schema

**With the CLI (recommended):**
```bash
supabase db push               # runs migrations/0001 → 0003 in order
```
**Or by hand:** open Dashboard ▸ SQL Editor and run, in order:
`migrations/0001_profiles.sql`, `0002_core_schema.sql`, `0003_auth_hook_grants.sql`.

## 2. Enable the custom access-token hook (injects `user_role` into the JWT)

Dashboard ▸ Authentication ▸ Hooks ▸ **Custom Access Token** →
select `public.custom_access_token_hook` → Save.
(Without this, RLS and the frontend can't see the role and everything denies.)

## 3. Generate + set the AES key (server-only secret)

```bash
# 32 bytes / 256-bit, hex:
openssl rand -hex 32
supabase secrets set AES_KEY=<the-hex-from-above>
```
`SUPABASE_URL`, `SUPABASE_ANON_KEY`, `SUPABASE_SERVICE_ROLE_KEY` are injected into
the Edge runtime automatically — do **not** set them manually.

## 4. Deploy the Edge Functions

```bash
supabase functions deploy create-record read-record verify-integrity
```

## 5. Point the frontend at the project

Edit `frontend/js/env.js` (gitignored) and fill in:
```js
window.__ENV__ = {
  SUPABASE_URL: 'https://<ref>.supabase.co',
  SUPABASE_ANON_KEY: '<anon-key>',
  FUNCTIONS_URL: '',
};
```
Reload the app. It leaves demo mode automatically once both keys are present:
login becomes live and dashboards require a real session.

## 6. Create the first admin + link patient logins

Sign up once through the UI, then in the SQL editor promote that user:
```sql
update public.profiles set role = 'ADMIN', status = 'active'
where id = (select id from auth.users where email = 'you@example.com');
```
Re-login to refresh the JWT (the role claim is minted at token time). The Admin
can then manage other users. For a patient to see their own records, link their
login to a patient chart:
```sql
update public.patients set user_id =
  (select id from auth.users where email = 'patient@example.com')
where mrn = 'MRN-XXXXX';
```

## What enforces what (Increment 1)

| Concern | Mechanism |
| --- | --- |
| Authentication | Supabase Auth (email/password) |
| Role in JWT | `custom_access_token_hook` → `user_role` claim |
| Row visibility (lists) | RLS, deny-by-default, keyed on `auth.uid()` + `user_role` |
| Clinical content | AES-256-GCM; key only in `AES_KEY` secret; decrypt only in `read-record` |
| Policy authz | capability matrix in `_shared/auth.ts` (→ on-chain RBAC in Increment 3) |
| Integrity | SHA-256 over the canonical record; `verify-integrity` re-hashes (→ on-chain anchor in Increment 2) |
| Audit | append-only `audit_log`, written by service role, no client edit/delete |
