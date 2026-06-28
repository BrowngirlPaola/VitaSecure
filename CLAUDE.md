# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project status: pre-implementation

This repository currently contains **only design documents — no code yet**. It is the planning artefact for a Final Year Project (BSc Software Engineering, The ICT University): a **Secure EHR system with blockchain integrity verification and role-based access control** ("VitaSecure" / "secure-ehr").

The three source-of-truth documents are:

- `EHR_SRS_and_Implementation_Plan.md` — requirements (functional/non-functional), the **role–permission matrix (§5)**, data entities (§8), and the 4-increment build plan (§17).
- `EHR_Structure_TechStack_Directives.md` — the **authoritative implementation directives** (pipelines, conventions, folder layout, config keys). Read §4 before writing any backend code.
- `EHR_UML_Diagrams.md` — use-case, sequence, component and class diagrams (Mermaid). The sequence diagrams in §2 are the precise contract for the write/read/verify/lab-order flows.

When these documents disagree, `EHR_SRS_and_Implementation_Plan.md` defines *what*, `EHR_Structure_TechStack_Directives.md` defines *how*. Note one deliberate stack choice: the SRS §13 lists React/Node/Express as illustrative, but the **Directives doc supersedes it** — the actual stack is vanilla JS + Supabase (Auth + Postgres + Edge Functions) + Solidity (see below). **Note:** the Directives doc names Clerk for auth, but a later project decision replaced it with **Supabase Auth** — see the auth note under "Architecture" below.

## Architecture: three security layers (the core idea)

The system's defining principle is that **three different security concerns use three different mechanisms** — keep them separate; this separation is the research contribution and must not be collapsed:

| Concern          | Question                         | Mechanism                                                        | Authoritative? |
| ---------------- | -------------------------------- | ---------------------------------------------------------------- | -------------- |
| Authentication   | Who are you?                     | **Supabase Auth** (email/password, sessions)               | —             |
| Data-layer authz | Can this row be returned at all? | **Supabase RLS** keyed on `auth.uid()` + `user_role` JWT claim | backstop only  |
| Policy authz     | May this role do this action?    | **On-chain RBAC smart contract**, called by Edge Functions | **yes**  |
| Integrity        | Has the record been altered?     | **SHA-256 hash anchored on a permissioned EVM chain**      | **yes**  |

> **Auth decision (supersedes Directives §4.2):** the project uses **Supabase Auth** directly, not Clerk. Roles live in `public.profiles.role` and are injected into the JWT as the `user_role` claim via a custom access-token hook — see `supabase/migrations/0001_profiles.sql`. Frontend auth lives in `frontend/js/auth.js`.

Flow: Supabase Auth authenticates → the Supabase client carries the user's JWT → RLS gates the row → for any privileged/clinical operation an **Edge Function** calls the on-chain RBAC contract for the authoritative permit/deny, then runs **encrypt → hash → anchor → audit**.

Critical invariants:

- **Raw clinical content is never in the clear** outside the Edge Functions. It lives AES-256-GCM-encrypted in Postgres; the AES key is held **only** in Edge Function secrets — never in a table, never in the frontend.
- **The frontend never holds the AES key** and cannot decrypt — all clinical reads go through `read-record`.
- **The on-chain RBAC contract wins on conflict.** The same permission matrix is enforced in three places — `guard.js` (UX), RLS (DB), RBAC contract (authoritative) — but the contract is the decision-maker.
- **Records are never written to the chain** — only the SHA-256 hash + metadata is anchored (off-chain store + on-chain anchor pattern).
- **Updates never overwrite.** Every modification creates a new `version`, re-hashes, and anchors again; the prior anchor remains.

## Planned stack & structure

Single repo, three workspaces mirroring the architectural layers (see Directives §3 for the full tree):

- `frontend/` — HTML5 + CSS3 + vanilla JS (ES modules), one dashboard page per role. Styling uses Tailwind (CDN) configured from `assets/js/tailwind.config.js` (the Aura EHR tokens) plus `assets/css/styles.css` (glassmorphism component classes from the Stitch screens). Key modules: `auth.js` (Supabase Auth: sign-in/up, session, role), `supabaseClient.js` (shared Supabase client), `api.js` (Edge Function wrappers via `supabase.functions.invoke`), `roles.js` (role constants + per-role nav — **must match DB claims and contracts exactly**), `guard.js` (role gate), `layout.js` (shared dashboard chrome), `widgets.js` (UI fragments).
- `supabase/` — `migrations/` (schema + RLS, deny-by-default on every table), `seed/` (synthetic data **only** — ethics requirement), and `functions/` (Deno + TypeScript Edge Functions = the privileged backend). Shared logic lives in `functions/_shared/` (`auth.ts`, `crypto.ts`, `chain.ts`, `audit.ts`); handlers stay thin.
- `blockchain/` — Hardhat project. Contracts `RBAC.sol`, `IntegrityAnchor.sol`, `Audit.sol` (audit may be events on the others). `deploy.ts` writes `deployments/addresses.json` and ABIs — **never hard-code contract addresses**; Edge Functions read them from secrets/env.

## The write pipeline (every clinical create/update must follow this exactly)

Inside the `create-record` Edge Function (Directives §4.5):

1. Verify the Supabase JWT; extract `sub` (user id) + `user_role`.
2. Validate the payload at the function boundary.
3. Authorize via `RBAC.checkAccess(user, action, resource)` on-chain **before acting**.
4. **Canonicalise** (stable field ordering) so equal records hash equally.
5. AES-256-GCM encrypt sensitive fields (store IV + auth tag; leave identifiers/FKs in clear so RLS and queries still work).
6. Insert encrypted row with a new `version`.
7. SHA-256 hash the canonical record.
8. Anchor `{recordId, recordType, hash, authorId, version, timestamp}` via `IntegrityAnchor.anchorHash()`; store the returned `anchor_tx_id` on the row.
9. Audit the event on-chain.

If step 8 fails (node unreachable), mark the row `pending-anchor` and queue for deferred commit — **never lose the write**.

Reads mirror this: `read-record` authorizes on-chain → fetches → decrypts server-side → returns. `verify-integrity` re-hashes the stored record and compares to the on-chain anchor, returning **VERIFIED** or **TAMPERED** (this path produces the tamper-detection-rate and hash-verification-time evaluation metrics).

## Roles (must be identical across frontend, RLS claims, and contracts)

Six roles: `ADMIN`, `DOCTOR`, `NURSE`, `LAB_TECHNICIAN`, `RECEPTIONIST`, `PATIENT`. The authoritative capability matrix is SRS §5. Note: even the **Administrator is denied all clinical-content operations** (least privilege is enforced technically, not by convention).

## Authentication detail (easy to get wrong)

Use **Supabase Auth** (email/password) directly — Clerk is no longer used. The application role lives in `public.profiles.role` (enum `app_role`) and is injected into the access token as the `user_role` claim by a **custom access-token hook** (`public.custom_access_token_hook`, enabled in `supabase/config.toml` / dashboard). A `handle_new_user` trigger creates a `profiles` row on sign-up; an admin confirms the authoritative role (on-chain via `assign-role`). RLS policies read `auth.uid()` (the user id, = JWT `sub`) and `auth.jwt() ->> 'user_role'`. The login UI is a hand-mounted form bound to `supabase.auth.signInWithPassword` / `signUp` in `frontend/js/auth.js` + `frontend/js/pages/index.js`. See `supabase/migrations/0001_profiles.sql`.

## Build order (increments — do not jump ahead)

1. **Increment 1:** Supabase schema + RLS + Supabase Auth + frontend login/dashboards + `read-record`/`create-record` with AES encryption. **No chain yet.**
2. **Increment 2:** `IntegrityAnchor.sol` + hashing/anchoring/verify wired in + VERIFIED/TAMPERED badge UI.
3. **Increment 3:** `RBAC.sol` + `checkAccess` enforcement + consent + on-chain audit + patient access-log view.
4. **Increment 4:** integration, security/performance/usability testing, hardening.

Unit-test every smart-contract function in Hardhat **before** wiring it to an Edge Function.

## Commands

No build tooling exists yet. Once the workspaces are scaffolded, the expected commands (from Directives §4.1) will be:

- **Local bring-up order:** `supabase start` → run migrations + seed → start Hardhat node → `npx hardhat run scripts/deploy.ts` (writes `addresses.json`) → `supabase secrets set ...` → serve `frontend/` with any static server.
- **Contract tests:** `npx hardhat test` (in `blockchain/`); single test e.g. `npx hardhat test test/RBAC.test.ts`.
- **Edge Functions:** served by `supabase start` / `supabase functions serve`.

Update this section with the real commands as `package.json` / `hardhat.config.ts` / `config.toml` are created.

## Required configuration keys

- `frontend` config: `SUPABASE_URL`, `SUPABASE_ANON_KEY` (surfaced via `window.__ENV__` → `js/config.js`).
- Edge Function secrets (`supabase secrets set`, never in DB): `AES_KEY`, `CHAIN_RPC_URL`, `ANCHOR_SIGNER_KEY`, `RBAC_CONTRACT_ADDRESS`, `ANCHOR_CONTRACT_ADDRESS` (token verification uses the Supabase JWT secret — no Clerk JWKS).
- `blockchain/.env`: `RPC_URL`, dev deployer key (never a real key).

## MCP tooling

The **Stitch** MCP server (Google's AI UI-design tool) is configured in `.mcp.json` and enabled in `.claude/settings.local.json` — useful for generating and pulling the role dashboard screens.

### Stitch authentication (API key)

`.mcp.json` authenticates to `https://stitch.googleapis.com/mcp` with a long-lived Google **API key** (the official, recommended method — not OAuth):

```json
"headers": { "X-Goog-Api-Key": "${STITCH_API_KEY}" }
```

The key comes from the **`STITCH_API_KEY`** environment variable. To obtain it: sign in at **stitch.withgoogle.com/settings** → **API Keys** section → **Create API Key** → copy. Then set it at user scope and restart Claude Code:

```powershell
[Environment]::SetEnvironmentVariable("STITCH_API_KEY", "your-real-key", "User")
```

Critical gotchas:
- **`.mcp.json` env expansion and MCP server startup happen once, at Claude Code launch.** After setting the key you must **restart Claude Code** — setting it in a running session has no effect.
- The error `Incompatible auth server: does not support dynamic client registration` means the key is **missing, empty, or invalid**: the server returns 401, the MCP client falls back to an OAuth flow, and Google's OAuth server rejects the dynamic-client-registration step. The fix is a valid key in `STITCH_API_KEY` — not OAuth.
- An OAuth/bearer-token route exists as a fallback for environments that can't store a key on disk, but it expires hourly and needs constant refresh; prefer the API key.


### UI Design System

 When creating new pages or components, always reference the design system @docs/design-system
