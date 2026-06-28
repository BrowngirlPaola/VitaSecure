# Aura EHR — Design System

The official design system for **VitaSecure / secure-ehr**, pulled from Stitch
(project *Secure Blockchain EHR System*, design system **Aura EHR**,
asset `assets/50d7a6f6a4244d6f978da7789187ad22`, version 1).

CLAUDE.md points all UI work here (`@docs/design-system`). When building any new
page or component, reference this folder.

## Style at a glance

- **Aesthetic:** Glassmorphism / Modern Dark — deep midnight canvas, frosted-glass surfaces.
- **Brand color:** Vivid Purple `#7C3AED` → Soft Lavender `#A78BFA` (135° gradient).
- **Typeface:** Plus Jakarta Sans (400 / 600 / 700).
- **Clinical status (non-negotiable):** Emerald `#10B981` = **VERIFIED**, Rose `#F43F5E` = **TAMPERED**.
  These map directly to the integrity-verification badge UI (Increment 2).
- **Shape:** Cards 24px radius · buttons & inputs 12px · status badges fully pill (999px).
- **Grid:** 12-col desktop / 8-col tablet / 4-col mobile, 4px baseline rhythm, 24px container padding.

## Files

| File | Purpose |
| ---- | ------- |
| `design.md` | **Canonical source of truth.** Frontmatter holds the full token set (colors, typography, spacing, radius); the body holds brand/usage guidelines. This is the exact Stitch design-md — re-uploadable to Stitch and parseable by tooling. |
| `tokens.css` | Ready-to-use CSS custom properties + thin helper classes (`.ds-card`, `.ds-btn-primary`, `.ds-badge--verified`, …). Import in the frontend's global stylesheet. |
| `README.md` | This overview. |

## Using it in the frontend (`frontend/`)

```css
/* global.css */
@import url('https://fonts.googleapis.com/css2?family=Plus+Jakarta+Sans:wght@400;600;700&display=swap');
@import '../docs/design-system/tokens.css';
```

```html
<button class="ds-btn-primary">Save record</button>

<!-- Integrity badge after verify-integrity returns -->
<span class="ds-badge ds-badge--verified">✓ Verified</span>
<span class="ds-badge ds-badge--tampered">⚠ Tampered</span>
```

Prefer the CSS variables (`var(--color-primary)`, `var(--type-headline-lg)`,
`var(--space-lg)`) over hard-coded hex/px so the design stays single-sourced.

## Re-syncing from Stitch

If the Aura EHR system changes in Stitch, re-pull with the Stitch MCP
(`list_design_systems` for project `15568753981626203531`) and overwrite
`design.md`, then regenerate the tokens in `tokens.css`.
