---
name: aura-ds-conventions
description: Aura EHR design-system audit conventions for the VitaSecure no-build static frontend — what counts as compliant vs a violation
metadata:
  type: project
---

The VitaSecure frontend is a no-build static site using Tailwind via CDN, configured from `frontend/assets/js/tailwind.config.js` (the Tailwind projection of `docs/design-system/design.md`, which is canonical). Component classes live in `frontend/assets/css/styles.css`.

**Why:** Tokens are projected as Tailwind utilities, so utility classes ARE the tokens — auditing must distinguish token utilities from arbitrary values.

**How to apply when auditing UI files:**
- Compliant (do NOT flag): `bg-white/5`, `bg-white/10`, `border-white/10`, `border-white/5` — these are the documented glass overlays (`rgba(255,255,255,0.05/0.10)`, design.md §Colors/§Elevation).
- Compliant: all `*-surface*`, `*-primary*`, `*-on-*`, `text-outline`, `verified`/`tampered` utilities — real tokens in tailwind.config.js.
- Acceptable arbitrary values (NOT violations): icon sizes `text-[NNpx]` on `.material-symbols-outlined`; layout/blur arbitraries (`max-w-[1100px]`, `blur-[120px]`, `max-h-[calc(...)]`, `top-[-10%]`); raw paddings `py-3.5`, `p-12`, `pl-12`, `px-1`; card radius `rounded-[24px]` (design.md §Shapes: 24px card radius).
- Real violations to fix: off-palette colors like `text-white`/`text-black`/hex/rgb (use `text-on-surface` = #e8dfee for near-white text); arbitrary font sizes on TEXT (not icon) elements — map to typography scale (e.g. 18px → `text-body-lg`, 24px → `text-headline-md`, 32px → `text-headline-lg`, 48px → `text-display-lg`).
- Clinical status colors are non-negotiable: `verified` #10b981, `tampered` #f43f5e.

Recurring violation seen on the sign-in page (`frontend/index.html`): `text-white` (→ `text-on-surface`) and `text-[18px]` on the submit button (→ `text-body-lg`). Both are color/size-equivalent fixes.
