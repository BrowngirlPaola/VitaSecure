# VitaSecure

**A secure Electronic Health Record (EHR) system with blockchain integrity verification and role‑based access control.**

VitaSecure encrypts every clinical record with **AES‑256‑GCM**, anchors a **SHA‑256** fingerprint of each record on a permissioned EVM blockchain, and lets an **on‑chain RBAC smart contract** — not a database flag — decide who may act. Integrity becomes something you can *verify*, not just trust.

> Final Year Project · BSc Software Engineering · The ICT University.
> Synthetic data only — no real patient information is ever used (ethics requirement).

---

## Table of contents

- [The core idea: three security layers](#the-core-idea-three-security-layers)
- [The write pipeline](#the-write-pipeline)
- [Roles](#roles)
- [Tech stack](#tech-stack)
- [Project structure](#project-structure)
- [Prerequisites & dependencies](#prerequisites--dependencies)
- [Setup & running locally](#setup--running-locally)
- [CI/CD & deployment](#cicd--deployment)
- [Build increments (status)](#build-increments-status)
- [Security invariants](#security-invariants)
- [Screenshots](#screenshots)
- [Documentation](#documentation)

---

## The core idea: three security layers

The system's defining principle is that **three different security concerns use three different mechanisms** — kept deliberately separate. This separation is the research contribution.

| Concern          | Question                         | Mechanism                                              | Authoritative? |
| ---------------- | -------------------------------- | ------------------------------------------------------ | -------------- |
| Authentication   | Who are you?                     | **Supabase Auth** (email/password, sessions)           | —              |
| Data‑layer authz | Can this row be returned at all? | **Postgres RLS** keyed on `auth.uid()` + role claim    | backstop only  |
| Policy authz     | May this role do this action?    | **On‑chain RBAC smart contract** (called by Edge Fns)  | **yes**        |
| Integrity        | Has the record been altered?     | **SHA‑256 hash anchored on a permissioned EVM chain**  | **yes**        |

**Flow:** Supabase Auth authenticates → the Supabase client carries the user's JWT → RLS gates the row → for any privileged/clinical operation an **Edge Function** calls the on‑chain RBAC contract for the authoritative permit/deny, then runs **encrypt → hash → anchor → audit**.

---

## The write pipeline

Every clinical create/update follows this exact sequence inside the `create-record` Edge Function:

1. **Authenticate** — verify the Supabase JWT; extract user id + role.
2. **Validate** the payload at the function boundary.
3. **Authorize** via `RBAC.checkAccess(user, action, resource)` on‑chain *before acting*.
4. **Canonicalise** (stable field ordering) so equal records hash equally.
5. **Encrypt** sensitive fields with AES‑256‑GCM (store IV + auth tag; identifiers/FKs stay in clear so RLS and queries work).
6. **Insert** the encrypted row with a new `version`.
7. **Hash** the canonical record with SHA‑256.
8. **Anchor** `{recordId, recordType, hash, authorId, version, timestamp}` on‑chain; store the returned `anchor_tx_id`.
9. **Audit** the event on‑chain.

If anchoring fails, the row is marked `pending-anchor` and queued for deferred commit — **the write is never lost**. `verify-integrity` re‑hashes a stored record and compares it to the on‑chain anchor, returning **VERIFIED** or **TAMPERED**.

---

## Roles

Six roles, least privilege, identical across the frontend, RLS claims, and contracts:

`ADMIN` · `DOCTOR` · `NURSE` · `LAB_TECHNICIAN` · `RECEPTIONIST` · `PATIENT`

> Even the **Administrator is denied all clinical‑content operations** — least privilege is enforced technically, not by convention.

---

## Tech stack

| Layer        | Technology |
| ------------ | ---------- |
| Frontend     | HTML5 · CSS3 · **vanilla JS (ES modules)** · Tailwind CSS (CDN) · Material Symbols |
| Auth         | Supabase Auth (email/password) |
| Database     | Supabase Postgres + Row‑Level Security |
| Backend      | Supabase **Edge Functions** (Deno + TypeScript) |
| Crypto       | AES‑256‑GCM (encryption) · SHA‑256 (integrity hash) |
| Blockchain   | Solidity + Hardhat on a permissioned EVM chain *(Increment 2+)* |
| CI/CD        | GitHub Actions → GitHub Pages (frontend) + Supabase deploy |

---

## Project structure

```
VitaSecure/
├── frontend/                     # Static SPA — vanilla JS, one page per role
│   ├── index.html                # Public landing page
│   ├── login.html                # Sign in / sign up
│   ├── pages/                    # Per-role dashboard shells (HTML)
│   │   ├── admin.html  doctor.html  nurse.html
│   │   ├── labtech.html  patient.html  receptionist.html
│   ├── js/
│   │   ├── supabaseClient.js     # Shared Supabase client
│   │   ├── auth.js               # Sign-in/up, session, role
│   │   ├── api.js                # Edge Function wrappers
│   │   ├── roles.js              # Role constants + per-role nav (source of truth)
│   │   ├── guard.js              # Client-side role gate (UX only)
│   │   ├── layout.js             # Shared dashboard chrome
│   │   ├── config.js / env.example.js   # Runtime config (copy env.example.js → env.js)
│   │   ├── data.js / widgets.js / ui.js
│   │   └── pages/                # Per-role + landing/login controllers
│   ├── assets/                   # Tailwind config + glassmorphism CSS
│   └── public/                   # Static images (hero, etc.)
│
├── supabase/                     # Backend: schema + RLS + Edge Functions
│   ├── migrations/               # 0001_profiles → 0004 (schema, RLS, auth hook)
│   ├── seed/seed.sql             # Synthetic data only
│   ├── functions/                # Deno + TypeScript Edge Functions
│   │   ├── _shared/              # auth, crypto, db, http, records, audit
│   │   ├── create-record/  read-record/  verify-integrity/
│   ├── config.toml
│   └── SETUP.md                  # Step-by-step backend bring-up
│
├── docs/
│   ├── design-system/            # Aura EHR tokens + design.md
│   ├── diagrams/                 # UML (.mmd + rendered .png)
│   ├── screenshots/              # Curated UI screenshots
│   ├── stitch-screens/           # Source design reference (HTML)
│   └── CICD.md                   # CI/CD pipeline + required secrets
│
├── .github/workflows/            # ci.yml, deploy-frontend.yml, deploy-supabase.yml
├── scripts/smoke-increment1.mjs  # End-to-end smoke test
├── EHR_SRS_and_Implementation_Plan.md   # Requirements (the "what")
├── EHR_Structure_TechStack_Directives.md# Implementation directives (the "how")
├── EHR_UML_Diagrams.md           # Use-case, sequence, component, class diagrams
├── CLAUDE.md                     # Guidance for AI coding assistants
├── .env.example                  # Environment template
└── README.md
```

> **`blockchain/`** (Hardhat project: `RBAC.sol`, `IntegrityAnchor.sol`, `Audit.sol`) lands in Increment 2 — see [build increments](#build-increments-status).

---

## Prerequisites & dependencies

Install these once:

| Tool | Purpose | Install |
| ---- | ------- | ------- |
| **Node.js 20+** | Frontend tooling / smoke test | <https://nodejs.org> |
| **Supabase CLI** | Migrations + Edge Function deploy | `npm install -g supabase` *(or `scoop install supabase` / `brew install supabase`)* |
| **Deno** | Edge Function runtime (bundled with Supabase CLI; install standalone for local type‑check) | <https://deno.land> |
| **OpenSSL** | Generate the AES key | bundled on macOS/Linux; Git Bash on Windows |
| A hosted **Supabase project** | Auth + Postgres + Edge Functions | <https://supabase.com> |
| Any **static file server** | Serve `frontend/` | `npx serve`, `python -m http.server`, etc. |

> The frontend has **no build step and no npm dependencies** — Tailwind and `@supabase/supabase-js` load from CDN / import map. Edge Functions resolve their imports via Deno.

---

## Setup & running locally

### 1. Configure the frontend

```bash
cp frontend/js/env.example.js frontend/js/env.js
```

Edit `frontend/js/env.js` with your project's **public** keys (Supabase ▸ Project Settings ▸ API):

```js
window.__ENV__ = {
  SUPABASE_URL: 'https://<your-ref>.supabase.co',
  SUPABASE_ANON_KEY: '<anon-key>',
  FUNCTIONS_URL: '', // optional; defaults to ${SUPABASE_URL}/functions/v1
};
```

> `env.js` is **gitignored**. Without keys the app runs in a read‑only **demo shell** so the UI is reviewable; with keys it goes live.

### 2. Set up the backend

Full instructions in **[`supabase/SETUP.md`](supabase/SETUP.md)**. In short:

```bash
supabase login
supabase link --project-ref <your-project-ref>
supabase db push                              # apply migrations 0001 → 0004
# Dashboard ▸ Authentication ▸ Hooks → enable custom_access_token_hook
supabase secrets set AES_KEY=$(openssl rand -hex 32)
supabase functions deploy create-record read-record verify-integrity
```

Then promote your first user to `ADMIN` (see `supabase/SETUP.md` §6).

### 3. Serve the frontend

```bash
npx serve frontend          # or: python -m http.server -d frontend 8080
```

Open the served URL — the landing page is `index.html`, sign in via `login.html`.

### 4. Smoke‑test the backend (optional)

```bash
node scripts/smoke-increment1.mjs
```

---

## CI/CD & deployment

Three GitHub Actions workflows (details in **[`docs/CICD.md`](docs/CICD.md)**):

| Workflow | Trigger | Does |
| -------- | ------- | ---- |
| `ci.yml` | push / PR to `main` | Deno `lint` + `check` on Edge Functions; `node --check` on frontend JS |
| `deploy-frontend.yml` | push to `frontend/**` | Generates `env.js` from secrets, deploys `frontend/` to **GitHub Pages** |
| `deploy-supabase.yml` | push to `supabase/**` | Links project, `db push`, deploys Edge Functions |

**One‑time setup to go live:**

1. **Settings ▸ Pages ▸ Source → "GitHub Actions"**.
2. **Settings ▸ Secrets and variables ▸ Actions** → add:
   - Frontend: `SUPABASE_URL`, `SUPABASE_ANON_KEY`
   - Backend: `SUPABASE_ACCESS_TOKEN`, `SUPABASE_PROJECT_REF`, `SUPABASE_DB_PASSWORD`

> **Never commit secrets.** `AES_KEY`, `ANCHOR_SIGNER_KEY`, `CHAIN_RPC_URL`, the service‑role key, `.env*`, and `frontend/js/env.js` are gitignored / live only in Supabase secrets or GitHub Actions secrets.

---

## Build increments (status)

| # | Scope | Status |
| - | ----- | ------ |
| **1** | Supabase schema + RLS + Auth + frontend (landing, login, six dashboards) + `create-record`/`read-record` with AES encryption. **No chain yet.** | ✅ Implemented |
| **2** | `IntegrityAnchor.sol` + hashing/anchoring/verify wired in + VERIFIED/TAMPERED badge | ⏳ Planned |
| **3** | `RBAC.sol` + `checkAccess` enforcement + consent + on‑chain audit + patient access‑log | ⏳ Planned |
| **4** | Integration, security/performance/usability testing, hardening | ⏳ Planned |

---

## Security invariants

- **Raw clinical content is never in the clear** outside Edge Functions — AES‑256‑GCM at rest; the key lives **only** in Edge Function secrets.
- **The frontend never holds the AES key** and cannot decrypt — all clinical reads go through `read-record`.
- **The on‑chain RBAC contract wins on conflict** — the same matrix exists in `guard.js` (UX), RLS (DB), and the contract (authoritative), but the contract decides.
- **Records are never written to the chain** — only the SHA‑256 hash + metadata is anchored.
- **Updates never overwrite** — every change is a new `version`, re‑hashed and re‑anchored; the prior anchor stands.
- **Synthetic/seed data only** — ethics requirement.

---

## Screenshots

Curated UI captures live in [`docs/screenshots/`](docs/screenshots/):

| | |
| --- | --- |
| Authentication | `01-auth.png` |
| Doctor dashboard | `02-doctor.png` |
| Patient dashboard | `03-patient.png` |
| Admin dashboard | `04-admin.png` |
| Nurse dashboard | `05-nurse.png` |
| Lab Technician dashboard | `06-labtech.png` |
| Receptionist dashboard | `07-receptionist.png` |

---

## Documentation

| Document | Contents |
| -------- | -------- |
| [`EHR_SRS_and_Implementation_Plan.md`](EHR_SRS_and_Implementation_Plan.md) | Requirements, role–permission matrix (§5), data entities (§8), build plan (§17) — the **what** |
| [`EHR_Structure_TechStack_Directives.md`](EHR_Structure_TechStack_Directives.md) | Authoritative implementation directives — the **how** |
| [`EHR_UML_Diagrams.md`](EHR_UML_Diagrams.md) | Use‑case, sequence, component, class diagrams (Mermaid) |
| [`supabase/SETUP.md`](supabase/SETUP.md) | Backend bring‑up, step by step |
| [`docs/CICD.md`](docs/CICD.md) | CI/CD pipelines + required secrets |
| [`docs/design-system/`](docs/design-system/) | Aura EHR design tokens & component conventions |

---

*VitaSecure · secure‑ehr — records remain encrypted and verifiable.*
</content>
</invoke>
