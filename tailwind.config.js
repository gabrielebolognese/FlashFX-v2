/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{js,ts,jsx,tsx}'],
  theme: {
    extend: {
      // Colors read the CSS vars in src/index.css (the single source of truth).
      colors: {
        // Surface ladder — depth via a lighter step, never a shadow.
        surface: {
          sunken: 'var(--ffx-bg-sunken)',
          DEFAULT: 'var(--ffx-bg)',
          0: 'var(--ffx-bg)', // legacy alias
          1: 'var(--ffx-surface-1)',
          2: 'var(--ffx-surface-2)',
          3: 'var(--ffx-surface-3)',
          4: 'var(--ffx-surface-4)',
          5: 'var(--ffx-surface-5)',
        },
        // Lines — white-alpha, adapt to any surface.
        hairline: 'var(--ffx-hairline)',
        edge: {
          DEFAULT: 'var(--ffx-border)',
          subtle: 'var(--ffx-hairline)',
          strong: 'var(--ffx-surface-5)', // legacy alias
        },
        // Accent — the gold (used sparingly).
        accent: {
          DEFAULT: 'var(--ffx-accent)',
          hover: 'var(--ffx-accent-hover)',
          wash: 'var(--ffx-accent-wash)',
          dim: 'var(--ffx-accent-dim)',
          light: 'var(--ffx-accent-hover)', // legacy alias
          muted: 'var(--ffx-accent-wash)', // legacy alias
        },
        'on-accent': 'var(--ffx-on-accent)',
        // Text — hierarchy via value step.
        primary: 'var(--ffx-text-primary)',
        secondary: 'var(--ffx-text-secondary)',
        tertiary: 'var(--ffx-text-tertiary)',
        muted: 'var(--ffx-text-muted)',
        // Semantic.
        success: 'var(--ffx-success)',
        danger: 'var(--ffx-danger)',
        info: 'var(--ffx-info)',
        live: 'var(--ffx-live)',
      },
      fontFamily: {
        sans: 'var(--ffx-font-ui)',
        ui: 'var(--ffx-font-ui)',
        mono: 'var(--ffx-font-mono)',
      },
      borderRadius: {
        sm: 'var(--ffx-radius-sm)',
        DEFAULT: 'var(--ffx-radius-md)',
        md: 'var(--ffx-radius-md)',
        lg: 'var(--ffx-radius-lg)',
        xl: 'var(--ffx-radius-xl)',
        island: 'var(--ffx-radius-island)',
        pill: 'var(--ffx-radius-pill)',
      },
      boxShadow: {
        overlay: 'var(--ffx-shadow-overlay)',
        modal: 'var(--ffx-shadow-modal)',
        'top-highlight': 'var(--ffx-elev-top-highlight)',
        focus: 'var(--ffx-focus-ring)',
      },
      height: {
        compact: 'var(--ffx-h-compact)',
        default: 'var(--ffx-h-default)',
        comfortable: 'var(--ffx-h-comfortable)',
      },
      transitionDuration: {
        instant: '80ms',
        micro: '120ms',
        standard: '200ms',
        large: '300ms',
      },
      transitionTimingFunction: {
        out: 'var(--ffx-ease-out)',
        in: 'var(--ffx-ease-in)',
        move: 'var(--ffx-ease-move)',
        spring: 'var(--ffx-ease-spring)',
      },
      zIndex: {
        'canvas-banner': 'var(--ffx-z-canvas-banner)',
        island: 'var(--ffx-z-island)',
        overlay: 'var(--ffx-z-overlay)',
        modal: 'var(--ffx-z-modal)',
        recovery: 'var(--ffx-z-recovery)',
        top: 'var(--ffx-z-top)',
      },
      animation: {
        spotlight: 'spotlight 2s ease .75s 1 forwards',
      },
      keyframes: {
        spotlight: {
          '0%': {
            opacity: '0',
            transform: 'translate(-72%, -62%) scale(0.5)',
          },
          '100%': {
            opacity: '1',
            transform: 'translate(-50%,-40%) scale(1)',
          },
        },
      },
    },
  },
  plugins: [],
};
