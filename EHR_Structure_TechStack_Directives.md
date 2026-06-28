# Project Structure, Tech Stack and Implementation Directives

## Secure EHR System with Blockchain Integrity Verification and Role-Based Access Control

**Companion to:** the SRS and Implementation Plan
**Frontend:** HTML + CSS + vanilla JavaScript
**Authentication:** Clerk (native Supabase third-party auth provider)
**Backend + database:** Supabase (Postgres + Edge Functions)
**Integrity / authorization:** permissioned EVM blockchain (Solidity smart contracts)

---

## 1. The three security layers (read this first)

Three distinct concerns, three distinct mechanisms. Keeping them separate is your strongest defence point — it is textbook defence-in-depth, and it makes clear which part is your *research contribution*.

| Concern | Question | Mechanism | Is it your contribution? |
|---------|----------|-----------|--------------------------|
| **Authentication** | Who are you? | **Clerk** (login, sessions, MFA, password security) | No — a hardened, well-tested service |
| **Data-layer authorization** | Can this row be returned at all? | **Supabase Row Level Security (RLS)** keyed on the Clerk user ID + role claim | No — a database backstop |
| **Policy authorization (authoritative)** | May this role perform this action on this record? | **On-chain RBAC smart contract**, called by Edge Functions | **Yes** — tamper-evident access policy |
| **Integrity** | Has the record been altered? | **SHA-256 hash anchored on the permissioned chain** | **Yes** — tamper detection |

One-line flow: **Clerk authenticates → the Supabase client carries the Clerk token → RLS gates the database row → for any privileged or clinical operation, an Edge Function calls the on-chain RBAC contract for the authoritative permit/deny, then runs the encrypt → hash → anchor → audit pipeline.**

Clerk and Supabase never make the authoritative access decision and never hold raw clinical content in the clear — that lives encrypted in Postgres with the keys held only by the Edge Functions.

---

## 2. Recommended Tech Stack

| Layer / concern | Choice | Notes |
|-----------------|--------|-------|
| Presentation | **HTML5 + CSS3 + vanilla JavaScript (ES modules)** | No framework; one page per role dashboard |
| Auth UI + identity | **Clerk** via `@clerk/clerk-js` | Hosted sign-in/up, sessions, MFA |
| Data client | **`@supabase/supabase-js`** | Configured with an `accessToken()` callback returning the Clerk token |
| Application / backend | **Supabase Edge Functions** (Deno + TypeScript) | Privileged logic + server-side blockchain signing |
| Off-chain store | **Supabase Postgres** + RLS + app-layer **AES-256-GCM** | The "off-chain encrypted store" of Figure 3.2; ERD maps directly |
| File storage (optional) | **Supabase Storage** (encrypted lab attachments) | Only if lab results include files |
| Realtime (optional) | **Supabase Realtime** | Live dashboards (e.g., results appear for the doctor instantly) |
| Authorization (authoritative) | **Solidity RBAC contract** on permissioned EVM | Your contribution |
| Integrity | **Solidity IntegrityAnchor contract** (SHA-256 anchors) | Your contribution |
| Blockchain dev/test | **Hardhat** local node; **Geth/Besu PoA** for the permissioned demo | True smart contracts, permissioned via PoA |
| Chain client (server) | **ethers.js** (`npm:ethers` in Edge Functions) | Server-side signer only |
| Hashing / encryption | **SHA-256** + **AES-256-GCM** | Per dissertation §3.7 |
| Local dev | **Supabase CLI** + **Hardhat** + a static server for `frontend/` | One-machine setup |
| Version control | **Git** | Per dissertation §3.7 |

---

## 3. Project Folder Structure

A single repository with three top-level workspaces — `frontend`, `supabase`, `blockchain` — plus `docs`. This mirrors the five architectural layers of Figure 3.2 and keeps the integrity and access-control concerns independently testable (NFR-MAINT-1).

```
secure-ehr/
├── README.md                       # Setup, run, build instructions
├── .gitignore
├── .env.example                    # Template of all required vars (no secrets committed)
│
├── frontend/                       # ── PRESENTATION LAYER (HTML/CSS/JS) ──
│   ├── index.html                  # Landing / sign-in entry
│   ├── pages/                      # One dashboard page per role
│   │   ├── admin.html
│   │   ├── doctor.html
│   │   ├── nurse.html
│   │   ├── labtech.html
│   │   ├── receptionist.html
│   │   └── patient.html
│   ├── assets/
│   │   ├── css/styles.css
│   │   └── img/
│   └── js/
│       ├── clerkClient.js          # Init @clerk/clerk-js; sign-in/out; current user
│       ├── supabaseClient.js       # Init supabase-js with accessToken() -> Clerk token
│       ├── api.js                  # Wrappers that call Edge Functions
│       ├── roles.js                # Role constants (MUST match DB claims + contracts)
│       ├── guard.js                # Client-side role gate (redirect on wrong role)
│       └── pages/                  # Per-page logic
│           ├── admin.js
│           ├── doctor.js
│           ├── nurse.js
│           ├── labtech.js
│           ├── receptionist.js
│           └── patient.js
│
├── supabase/                       # ── APPLICATION/RBAC + OFF-CHAIN STORE ──
│   ├── config.toml                 # Local config incl. Clerk third-party auth block
│   ├── migrations/                 # Versioned SQL: schema + RLS policies
│   │   ├── 0001_init_tables.sql    # All entities from SRS §8
│   │   ├── 0002_rls_policies.sql   # RLS on every table (deny-by-default)
│   │   └── 0003_audit.sql
│   ├── seed/
│   │   └── synthetic.sql           # Synthetic/anonymised data ONLY (ethics §3.10)
│   └── functions/                  # Edge Functions (Deno/TS) = privileged backend
│       ├── _shared/
│       │   ├── cors.ts
│       │   ├── auth.ts             # Extract/verify Clerk claims (sub, role)
│       │   ├── crypto.ts           # canonicalise() + SHA-256 + AES-256-GCM
│       │   ├── chain.ts            # ethers provider/signer + contract instances
│       │   └── audit.ts            # Write + anchor audit events
│       ├── create-record/index.ts  # WRITE pipeline (encounter/vitals/labresult/rx)
│       ├── read-record/index.ts    # Authorize -> fetch -> decrypt -> return
│       ├── verify-integrity/index.ts  # Re-hash -> compare to on-chain anchor
│       ├── assign-role/index.ts    # Admin: set role + anchor on RBAC contract
│       └── consent/index.ts        # Patient: grant/revoke + anchor
│
├── blockchain/                     # ── BLOCKCHAIN INTEGRITY LAYER (Hardhat) ──
│   ├── hardhat.config.ts
│   ├── package.json
│   ├── .env                        # RPC_URL + dev deployer key (never a real key)
│   ├── contracts/
│   │   ├── RBAC.sol                # Roles, permissions, checkAccess(), events
│   │   ├── IntegrityAnchor.sol     # anchorHash(), getAnchor(), verify(), events
│   │   └── Audit.sol               # (or events on the above) immutable audit trail
│   ├── scripts/deploy.ts           # Deploys; writes deployments/addresses.json
│   ├── test/                       # Hardhat unit tests per contract
│   │   ├── RBAC.test.ts
│   │   ├── IntegrityAnchor.test.ts
│   │   └── Audit.test.ts
│   └── deployments/
│       ├── addresses.json          # Consumed by Edge Functions (via secrets/env)
│       └── abi/                    # Compiled ABIs for the Edge Function chain client
│
└── docs/
    ├── SRS_and_Implementation_Plan.md
    ├── Structure_TechStack_Directives.md   # this file
    ├── architecture.png                    # Figure 3.2 realised
    └── uml/                                # use-case, class, sequence, ERD
```

---

## 4. Implementation Directives

### 4.1 Environment and setup
1. Never commit secrets. Keep `.env.example` current; real values live in untracked files and in Supabase secrets.
2. **Frontend config** (`frontend/js/*` read from a small `config.js` or injected values): `CLERK_PUBLISHABLE_KEY`, `SUPABASE_URL`, `SUPABASE_ANON_KEY`.
3. **Edge Function secrets** (set with `supabase secrets set ...`, never in the DB): `AES_KEY`, `CHAIN_RPC_URL`, `ANCHOR_SIGNER_KEY` (the blockchain private key), `RBAC_CONTRACT_ADDRESS`, `ANCHOR_CONTRACT_ADDRESS`, `CLERK_JWKS_URL` (for token verification if you verify in-function).
4. **Blockchain config** (`blockchain/.env`): `RPC_URL`, dev deployer key.
5. Local bring-up order: `supabase start` (Postgres + Edge runtime) → run migrations + seed → start Hardhat node → deploy contracts (writes `addresses.json`) → set Edge Function secrets → serve `frontend/` with any static server.

### 4.2 Clerk + Supabase authentication (current 2025 method)
The old JWT-template method is deprecated; use Clerk as a **native third-party auth provider**.
1. In the **Clerk dashboard**, enable Supabase compatibility (Connect with Supabase) and copy the Clerk domain.
2. In the **Supabase dashboard**, Authentication → Sign In/Providers → Third-Party Auth → add **Clerk**, pasting the Clerk domain. For local dev, add the equivalent Clerk third-party-auth block to `supabase/config.toml`.
3. Add a **`role` claim** to Clerk session tokens (customise the token); authenticated users carry the `authenticated` value plus your application role.
4. In `frontend/js/supabaseClient.js`, configure the client so Supabase receives the Clerk token:
   ```js
   import { createClient } from '@supabase/supabase-js'
   const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
     async accessToken() {
       return (await window.Clerk?.session?.getToken()) ?? null
     }
   })
   ```
5. Do **not** build login forms by hand — mount Clerk's components. This satisfies FR-AUTH-1/2/3/5/7. Configure session idle-timeout in Clerk to satisfy auto-logoff (FR-AUTH-4).

### 4.3 Supabase Row Level Security (data-layer backstop)
1. Enable RLS on **every** table; **deny by default** (FR-AC-3).
2. Write policies that read Clerk claims via `auth.jwt()`:
   - Clerk user ID: `auth.jwt() ->> 'sub'`
   - Role: `auth.jwt() ->> 'role'`
3. Patient tables: a patient may select only rows where `patient_clerk_id = auth.jwt() ->> 'sub'`. Staff tables: restrict by role and assignment. Example pattern:
   ```sql
   create policy "patient reads own record"
   on encounters for select
   using ( patient_clerk_id = auth.jwt() ->> 'sub' );

   create policy "doctor reads assigned encounters"
   on encounters for select
   using ( (auth.jwt() ->> 'role') = 'doctor' );
   ```
4. RLS is a **backstop**, not the authoritative policy. The on-chain RBAC contract is authoritative (see 4.4). RLS exists so that even a direct `supabase-js` read cannot leak data.

### 4.4 Authorization via the on-chain RBAC contract (authoritative)
1. Every privileged or clinical operation routes through an **Edge Function**, which calls `RBAC.checkAccess(user, action, resource)` on-chain **before** acting (FR-AC-1, FR-AC-2).
2. Deny by default; even the Administrator is denied clinical-content operations (FR-ADM-7, FR-AC-5).
3. Enforce the SRS §5 matrix consistently in three places — `guard.js` (UX), RLS (DB), RBAC contract (authoritative). The contract wins on conflict.
4. Every decision, permit and deny, is audited (FR-AC-4).

### 4.5 Record write pipeline (the core directive — `create-record`)
Every create/update of a clinical record (encounter, vitals, lab order/result, prescription) must follow this exact sequence inside the Edge Function:
1. **Verify** the Clerk token and extract `sub` + `role`.
2. **Validate** the input payload.
3. **Authorize** via `RBAC.checkAccess`.
4. **Canonicalise** the record (stable field ordering) so equal records hash equally.
5. **Encrypt** sensitive fields with AES-256-GCM using `AES_KEY` (NFR-SEC-2).
6. **Insert** the encrypted row in Postgres with a new `version` — updates never overwrite (FR-INT-3).
7. **Hash** the canonical record with SHA-256 (FR-INT-1).
8. **Anchor** `{recordId, recordType, hash, authorId, version, timestamp}` on-chain via `IntegrityAnchor.anchorHash()` using the `ANCHOR_SIGNER_KEY`; store the returned `anchor_tx_id` on the row (FR-INT-2).
9. **Audit** the event on-chain (FR-AUD-1/2).

If step 8 fails (node unreachable), mark the row `pending-anchor` and queue it for deferred commit — never lose the write (NFR-REL-3, NFR-ENV-1).

### 4.6 Read and verify pipelines
1. **Clinical reads** go through `read-record`: verify token → authorize via RBAC contract → fetch row → **decrypt** with `AES_KEY` → return. The frontend never holds the AES key, so it cannot decrypt directly — this keeps keys server-side (NFR-SEC-6).
2. **Lightweight, non-sensitive reads** (e.g., the appointment calendar list) may use `supabase-js` directly under RLS for responsiveness/realtime.
3. **Integrity verification** (`verify-integrity`): fetch row → decrypt → canonicalise → re-hash → compare with the on-chain anchor via `IntegrityAnchor.verify()` → return **VERIFIED** or **TAMPERED** (FR-INT-4). A TAMPERED result is surfaced with a visible badge and logged (FR-INT-5). This path produces your *tamper-detection rate* and *hash-verification time* metrics.

### 4.7 Off-chain store directives
1. App-layer AES-256-GCM on clinical free-text and result fields; leave identifiers/foreign keys in clear so the DB stays queryable and RLS can act on them.
2. Encryption keys live only in Edge Function secrets — never in a table, never in the frontend (NFR-SEC-6).
3. Foreign keys: encounter→patient, labOrder→encounter, labResult→labOrder, prescription→encounter.
4. Store `version`, `record_hash`, `anchor_tx_id` on every record-bearing table.
5. Seed only synthetic/anonymised data (NFR-COMP-2).

### 4.8 Edge Function conventions
1. Shared logic (CORS, auth, crypto, chain, audit) lives in `_shared/`; handlers stay thin.
2. Validate all input at the function boundary before any DB or chain call.
3. Import the chain client with `npm:ethers`; the signer is constructed from the secret key inside the function, never exposed.

### 4.9 Smart contract directives
1. Three logical contracts: `RBAC`, `IntegrityAnchor`, `Audit` (audit may be events on the others).
2. Emit events on every state change — the event log *is* the immutable audit trail.
3. Unit-test every function in Hardhat **before** wiring it to an Edge Function (NFR-MAINT-3).
4. `deploy.ts` writes `deployments/addresses.json` and copies ABIs to `deployments/abi/`; provide both to Edge Functions via secrets/env — never hard-code addresses.

### 4.10 Coding standards, Git, build order
1. TypeScript in Edge Functions and Hardhat; ES modules in the frontend; centralise role names so frontend, RLS claims and contracts match exactly.
2. Client error messages stay generic (no internal leakage, NFR-USE-3); detailed errors go to function logs.
3. One branch per increment; never commit `.env`, keys, `node_modules`, build output; tag at the end of each increment for the viva demo.
4. **Build order by increment** (mirrors dissertation §3.5):
   - **Increment 1:** `supabase/migrations` schema + RLS + Clerk third-party auth + `frontend` login and role dashboards + `read-record`/`create-record` with AES encryption. *No chain yet.*
   - **Increment 2:** `IntegrityAnchor.sol` + hashing/anchoring/verify wired into the Edge Functions + IntegrityBadge UI.
   - **Increment 3:** `RBAC.sol` + `checkAccess` enforcement + consent + on-chain audit + patient access-log view.
   - **Increment 4:** integration, security/performance/usability testing, hardening.

---

## 5. Defending the stack (have this ready for the viva)

1. **Why three security layers?** Authentication (Clerk), data-layer authorization (Supabase RLS) and authoritative policy authorization (on-chain RBAC) are different concerns. Layering them is defence-in-depth; the on-chain RBAC is the authoritative, tamper-evident policy and is the research contribution.
2. **Why Supabase?** It is open-source Postgres with RLS, so the off-chain store maps directly onto your ERD (§3.6) and the access backstop is enforced at the database itself — and crucially, **Supabase can be self-hosted**, which partly answers the "single cloud point of trust" concern that a fully proprietary backend would raise.
3. **Why Clerk for auth only?** Authentication is well-solved and not your contribution; using a hardened service avoids re-implementing security-critical code. Clerk never holds patient health information.
4. **Acknowledged trade-off.** Clerk (and hosted Supabase) require connectivity for sign-in, a real constraint in the low-resource setting — tie this to your §1.7 limitations. State the mitigation: Supabase self-hosting and cached Clerk sessions; a fully offline alternative would be a self-hosted provider such as Keycloak. Naming the alternative shows you understood the trade-off rather than missed it.

---

## 6. Required configuration keys (summary)

| Location | Keys |
|----------|------|
| `frontend` config | `CLERK_PUBLISHABLE_KEY`, `SUPABASE_URL`, `SUPABASE_ANON_KEY` |
| Supabase Edge Function secrets | `AES_KEY`, `CHAIN_RPC_URL`, `ANCHOR_SIGNER_KEY`, `RBAC_CONTRACT_ADDRESS`, `ANCHOR_CONTRACT_ADDRESS`, `CLERK_JWKS_URL` |
| `blockchain/.env` | `RPC_URL`, dev deployer key (never a real key) |
| Supabase + Clerk dashboards | Clerk "Connect with Supabase" enabled; Clerk added as Supabase third-party auth provider; `role` claim added to Clerk tokens |

---

*End of document.*
