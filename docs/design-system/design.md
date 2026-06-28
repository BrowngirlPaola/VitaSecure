---
name: Aura EHR
colors:
  surface: '#15121b'
  surface-dim: '#15121b'
  surface-bright: '#3c3742'
  surface-container-lowest: '#100d16'
  surface-container-low: '#1d1a24'
  surface-container: '#221e28'
  surface-container-high: '#2c2833'
  surface-container-highest: '#37333e'
  on-surface: '#e8dfee'
  on-surface-variant: '#ccc3d8'
  inverse-surface: '#e8dfee'
  inverse-on-surface: '#332f39'
  outline: '#958da1'
  outline-variant: '#4a4455'
  surface-tint: '#d2bbff'
  primary: '#d2bbff'
  on-primary: '#3f008e'
  primary-container: '#7c3aed'
  on-primary-container: '#ede0ff'
  inverse-primary: '#732ee4'
  secondary: '#cebdff'
  on-secondary: '#381385'
  secondary-container: '#4f319c'
  on-secondary-container: '#bea8ff'
  tertiary: '#ffb784'
  on-tertiary: '#4f2500'
  tertiary-container: '#a15100'
  on-tertiary-container: '#ffe0cd'
  error: '#ffb4ab'
  on-error: '#690005'
  error-container: '#93000a'
  on-error-container: '#ffdad6'
  primary-fixed: '#eaddff'
  primary-fixed-dim: '#d2bbff'
  on-primary-fixed: '#25005a'
  on-primary-fixed-variant: '#5a00c6'
  secondary-fixed: '#e8ddff'
  secondary-fixed-dim: '#cebdff'
  on-secondary-fixed: '#21005e'
  on-secondary-fixed-variant: '#4f319c'
  tertiary-fixed: '#ffdcc6'
  tertiary-fixed-dim: '#ffb784'
  on-tertiary-fixed: '#301400'
  on-tertiary-fixed-variant: '#713700'
  background: '#15121b'
  on-background: '#e8dfee'
  surface-variant: '#37333e'
typography:
  display-lg:
    fontFamily: Plus Jakarta Sans
    fontSize: 48px
    fontWeight: '700'
    lineHeight: '1.2'
    letterSpacing: -0.02em
  headline-lg:
    fontFamily: Plus Jakarta Sans
    fontSize: 32px
    fontWeight: '700'
    lineHeight: 40px
    letterSpacing: -0.01em
  headline-md:
    fontFamily: Plus Jakarta Sans
    fontSize: 24px
    fontWeight: '600'
    lineHeight: 32px
  body-lg:
    fontFamily: Plus Jakarta Sans
    fontSize: 18px
    fontWeight: '400'
    lineHeight: 28px
  body-md:
    fontFamily: Plus Jakarta Sans
    fontSize: 16px
    fontWeight: '400'
    lineHeight: 24px
  body-sm:
    fontFamily: Plus Jakarta Sans
    fontSize: 14px
    fontWeight: '400'
    lineHeight: 20px
  label-md:
    fontFamily: Plus Jakarta Sans
    fontSize: 12px
    fontWeight: '600'
    lineHeight: 16px
    letterSpacing: 0.05em
  headline-lg-mobile:
    fontFamily: Plus Jakarta Sans
    fontSize: 28px
    fontWeight: '700'
    lineHeight: 36px
rounded:
  sm: 0.25rem
  DEFAULT: 0.5rem
  md: 0.75rem
  lg: 1rem
  xl: 1.5rem
  full: 9999px
spacing:
  unit: 4px
  xs: 4px
  sm: 8px
  md: 16px
  lg: 24px
  xl: 40px
  gutter: 24px
  margin-mobile: 16px
  margin-desktop: 48px
---

## Brand & Style

The design system for this secure EHR platform is built on the pillars of **security, high-tech clinical innovation, and empathetic care.** It aims to transform the often-sterile medical interface into a sophisticated, focus-driven workspace.

The visual style is **Glassmorphism / Modern Dark**, utilizing a deep midnight canvas to reduce eye strain during long clinical shifts. It features high-fidelity frosted glass surfaces that imply depth and transparency, mirroring the system's commitment to data integrity and "clear" medical insights. Subtle gradients and crisp, high-contrast typography ensure that critical patient data remains the focal point while maintaining a premium, future-forward aesthetic.

## Colors

The palette is anchored by **Deep Midnight (#0F0720)**, providing a high-contrast base for the vibrant **Vivid Purple (#7C3AED)** primary brand color.

- **Primary & Secondary:** A range of purples and lavenders are used for actionable elements and brand highlights.
- **Surface Strategy:** Instead of solid grays, the system uses translucent white overlays (`rgba(255, 255, 255, 0.05)`) paired with a `12px` backdrop blur to create a glass effect.
- **Clinical Status:** Status indicators are non-negotiable. **Emerald (#10B981)** signifies "Verified" or "Healthy" states, while **Rose (#F43F5E)** is reserved for "Tampered" alerts or critical medical errors.
- **Gradients:** Use linear gradients from Primary to Secondary at 135 degrees for primary buttons and active navigation states.

## Typography

We use **Plus Jakarta Sans** for its exceptional legibility and modern, slightly rounded geometry which balances professional authority with a user-centric feel.

The hierarchy is strictly maintained to ensure medical professionals can scan patient charts quickly. Headlines use a **Bold (700)** weight with tighter letter spacing to create a sense of structural importance. Body text stays at a **Regular (400)** weight with generous line heights to prevent "text-crowding" in dense medical reports. Labels and Status Badges (like "VERIFIED") utilize **Semi-Bold (600)** and uppercase styling for immediate recognition.

## Layout & Spacing

This design system employs a **Fluid Grid** model to accommodate the massive amounts of data in EHR dashboards.

- **Grid:** A 12-column system is used for desktop, 8-column for tablet, and 4-column for mobile.
- **Rhythm:** A 4px baseline grid ensures vertical consistency.
- **Padding:** Content containers utilize a 24px (lg) internal padding to maintain the "breathable" feel of the glassmorphic style.
- **Responsive:** On mobile devices, glass surfaces should reduce their backdrop blur and increase opacity slightly to ensure performance and legibility on smaller screens.

## Elevation & Depth

Depth is conveyed through **Light Translucency** rather than traditional black shadows.

1.  **Level 0 (Base):** Deep Midnight background.
2.  **Level 1 (Cards/Sections):** Frosted glass (`rgba(255, 255, 255, 0.05)`) with a `1px` inner border (stroke) of `rgba(255, 255, 255, 0.1)` to define edges against the dark background.
3.  **Level 2 (Modals/Popovers):** Higher opacity (`rgba(255, 255, 255, 0.08)`) with a more aggressive backdrop blur (20px) and a soft, wide glow-shadow tinted with the Primary Purple (`rgba(124, 58, 237, 0.15)`).
4.  **Indicators:** Active states use a subtle outer glow (neon-effect) to signal focus without relying on heavy borders.

## Shapes

The shape language is purposefully soft and approachable. High-precision medical data is encased in **generously rounded containers (24px)** to offset the "sharpness" of the technical information.

- **Buttons & Inputs:** Use a 12px radius to feel tactile but distinct from the larger structural cards.
- **Badges:** Use a fully pill-shaped radius (999px) for status indicators like "VERIFIED" to distinguish them from interactive buttons.
- **Visual Continuity:** All strokes on inputs and card borders should remain thin (1px to 1.5px) to maintain a "crisp" medical-grade feel.

## Components

### Buttons
- **Primary:** Gradient fill (Vivid Purple to Soft Lavender), white text, 12px radius.
- **Secondary:** Ghost style with a Primary color border and a subtle glass fill on hover.

### Status Badges (Critical)
- **Verified:** Emerald background (20% opacity), Emerald 1px border, Emerald bold text. Includes a "check-shield" icon.
- **Tampered:** Rose background (20% opacity), Rose 1px border, Rose bold text. Includes an "alert-triangle" icon.

### Input Fields
- **Default:** Transparent fill with a `white (10%)` border. On focus, the border transitions to Primary Purple with a subtle inner glow.
- **Labels:** Always positioned above the field in `label-md` style for clinical clarity.

### Cards
- Standard containers for patient vitals, history, and charts. Must use the `24px` radius and `12px` backdrop blur. Use a 1px border to separate cards from the background.

### Data Visualization
- Charts should use Primary Purple for the main data line, with an Emerald secondary line for "Normal Range" comparisons. Background grid lines in charts should be very low contrast (`rgba(255, 255, 255, 0.05)`).
