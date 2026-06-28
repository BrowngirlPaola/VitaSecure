/* tailwind.config.js — shared Tailwind CDN config for every page.
 *
 * Load order in each HTML <head>:
 *   1. <script src="https://cdn.tailwindcss.com?plugins=forms,container-queries"></script>
 *   2. <script src="<rel>/assets/js/tailwind.config.js"></script>   ← this file
 *   3. <link rel="stylesheet" href="<rel>/assets/css/styles.css">
 *
 * These token values are the SAME design system as docs/design-system/design.md
 * (Aura EHR, pulled from Stitch). design.md remains the single source of truth;
 * this is its Tailwind projection so the Stitch markup resolves identically.
 */
tailwind.config = {
  darkMode: 'class',
  theme: {
    extend: {
      colors: {
        outline: '#958da1',
        'outline-variant': '#4a4455',
        surface: '#15121b',
        'surface-dim': '#15121b',
        'surface-bright': '#3c3742',
        'surface-container-lowest': '#100d16',
        'surface-container-low': '#1d1a24',
        'surface-container': '#221e28',
        'surface-container-high': '#2c2833',
        'surface-container-highest': '#37333e',
        'surface-variant': '#37333e',
        'surface-tint': '#d2bbff',
        background: '#15121b',
        'on-background': '#e8dfee',
        'on-surface': '#e8dfee',
        'on-surface-variant': '#ccc3d8',
        'inverse-surface': '#e8dfee',
        'inverse-on-surface': '#332f39',
        primary: '#d2bbff',
        'on-primary': '#3f008e',
        'primary-container': '#7c3aed',
        'on-primary-container': '#ede0ff',
        'inverse-primary': '#732ee4',
        'primary-fixed': '#eaddff',
        'primary-fixed-dim': '#d2bbff',
        'on-primary-fixed': '#25005a',
        'on-primary-fixed-variant': '#5a00c6',
        secondary: '#cebdff',
        'on-secondary': '#381385',
        'secondary-container': '#4f319c',
        'on-secondary-container': '#bea8ff',
        'secondary-fixed': '#e8ddff',
        'secondary-fixed-dim': '#cebdff',
        'on-secondary-fixed': '#21005e',
        'on-secondary-fixed-variant': '#4f319c',
        tertiary: '#ffb784',
        'on-tertiary': '#4f2500',
        'tertiary-container': '#a15100',
        'on-tertiary-container': '#ffe0cd',
        'tertiary-fixed': '#ffdcc6',
        'tertiary-fixed-dim': '#ffb784',
        'on-tertiary-fixed': '#301400',
        'on-tertiary-fixed-variant': '#713700',
        error: '#ffb4ab',
        'on-error': '#690005',
        'error-container': '#93000a',
        'on-error-container': '#ffdad6',
        /* Clinical status — non-negotiable (design.md) */
        verified: '#10b981',
        tampered: '#f43f5e',
      },
      borderRadius: {
        DEFAULT: '0.25rem',
        lg: '0.5rem',
        xl: '0.75rem',
        '2xl': '1rem',
        '3xl': '1.5rem',
        full: '9999px',
      },
      spacing: {
        xs: '4px',
        unit: '4px',
        sm: '8px',
        md: '16px',
        lg: '24px',
        xl: '40px',
        gutter: '24px',
        'margin-mobile': '16px',
        'margin-desktop': '48px',
      },
      fontFamily: {
        'display-lg': ['Plus Jakarta Sans'],
        'headline-lg': ['Plus Jakarta Sans'],
        'headline-lg-mobile': ['Plus Jakarta Sans'],
        'headline-md': ['Plus Jakarta Sans'],
        'body-lg': ['Plus Jakarta Sans'],
        'body-md': ['Plus Jakarta Sans'],
        'body-sm': ['Plus Jakarta Sans'],
        'label-md': ['Plus Jakarta Sans'],
      },
      fontSize: {
        'display-lg': ['48px', { lineHeight: '1.2', letterSpacing: '-0.02em', fontWeight: '700' }],
        'headline-lg': ['32px', { lineHeight: '40px', letterSpacing: '-0.01em', fontWeight: '700' }],
        'headline-lg-mobile': ['28px', { lineHeight: '36px', fontWeight: '700' }],
        'headline-md': ['24px', { lineHeight: '32px', fontWeight: '600' }],
        'body-lg': ['18px', { lineHeight: '28px', fontWeight: '400' }],
        'body-md': ['16px', { lineHeight: '24px', fontWeight: '400' }],
        'body-sm': ['14px', { lineHeight: '20px', fontWeight: '400' }],
        'label-md': ['12px', { lineHeight: '16px', letterSpacing: '0.05em', fontWeight: '600' }],
      },
    },
  },
};
