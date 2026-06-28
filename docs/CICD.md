# CI/CD

Three GitHub Actions workflows in `.github/workflows/`:

| Workflow | Trigger | What it does |
| --- | --- | --- |
| `ci.yml` | push / PR to `main` | Lints + type-checks the Deno Edge Functions; syntax-checks all frontend JS. |
| `deploy-frontend.yml` | push to `main` (`frontend/**`) | Generates `frontend/js/env.js` from secrets and publishes `frontend/` to GitHub Pages. |
| `deploy-supabase.yml` | push to `main` (`supabase/**`) | Links the hosted project, pushes migrations, deploys Edge Functions. |

No blockchain job yet — there are no contracts in the repo (Increment 2/3). When `blockchain/` is added, add a `contracts` job to `ci.yml` running `npx hardhat test`, and gate it so Edge Function deploys depend on green contract tests.

## One-time setup

### 1. Enable GitHub Pages
Settings → **Pages** → Build and deployment → Source: **GitHub Actions**.

### 2. Add repository secrets
Settings → **Secrets and variables → Actions → New repository secret**:

| Secret | Used by | Where to find it |
| --- | --- | --- |
| `SUPABASE_URL` | frontend deploy | `https://<ref>.supabase.co` (Project Settings → API). **Public.** |
| `SUPABASE_ANON_KEY` | frontend deploy | Project Settings → API → anon/public key. **Public.** |
| `SUPABASE_ACCESS_TOKEN` | supabase deploy | Account → Access Tokens (create one). **Secret.** |
| `SUPABASE_PROJECT_REF` | supabase deploy | the `<ref>` in your project URL. |
| `SUPABASE_DB_PASSWORD` | supabase deploy | Project Settings → Database. **Secret.** |

`deploy-supabase.yml` exits green with a warning until all three Supabase secrets exist, so it won't show as failed before you configure them.

### 3. Edge Function runtime secrets (set once, never in CI)
These hold real cryptographic material — set them directly on the project, not in GitHub:

```bash
supabase secrets set AES_KEY=... CHAIN_RPC_URL=... ANCHOR_SIGNER_KEY=... \
  RBAC_CONTRACT_ADDRESS=... ANCHOR_CONTRACT_ADDRESS=...
```

(The chain-related ones are only needed once Increment 2/3 lands.)

## Notes
- `frontend/js/env.js` is gitignored and **generated at deploy time** — only `SUPABASE_URL` + `SUPABASE_ANON_KEY` (both public) ever reach the browser.
- The service-role key, `AES_KEY`, and any signer key must **never** be added as frontend secrets.
