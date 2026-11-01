import type { Config } from 'tailwindcss'

/**
 * CommitFlex design tokens ("the ship log").
 *
 * Colours are CSS variables holding RGB channels (see app/globals.css), so
 * opacity modifiers such as `bg-accent/10` work in both themes. The default
 * Tailwind palette is intentionally replaced: only the tokens below exist.
 */
const token = (name: string) => `rgb(var(--c-${name}) / <alpha-value>)`

const config: Config = {
  darkMode: 'class',
  content: [
    './app/**/*.{js,ts,jsx,tsx,mdx}',
    './components/**/*.{js,ts,jsx,tsx,mdx}',
    './lib/**/*.{js,ts,jsx,tsx}',
  ],
  theme: {
    colors: {
      inherit: 'inherit',
      current: 'currentColor',
      transparent: 'transparent',
      white: '#FFFFFF',
      black: '#000000',

      canvas: token('canvas'),
      surface: token('surface'),
      sunken: token('sunken'),
      line: {
        DEFAULT: token('line'),
        strong: token('line-strong'),
      },
      fg: {
        DEFAULT: token('fg'),
        muted: token('fg-muted'),
        subtle: token('fg-subtle'),
      },
      accent: {
        DEFAULT: token('accent'),
        hover: token('accent-hover'),
        soft: token('accent-soft'),
        ink: token('accent-ink'),
        fg: token('accent-fg'),
      },
      marker: {
        DEFAULT: token('marker'),
        fg: token('marker-fg'),
      },
      success: {
        DEFAULT: token('success'),
        soft: token('success-soft'),
        fg: token('success-fg'),
      },
      warning: {
        DEFAULT: token('warning'),
        soft: token('warning-soft'),
      },
      danger: {
        DEFAULT: token('danger'),
        soft: token('danger-soft'),
        fg: token('danger-fg'),
      },
      linkedin: token('linkedin'),
      x: token('x'),
      // Backdrop behind dialogs and sheets.
      scrim: token('scrim'),
    },
    extend: {
      fontFamily: {
        sans: ['var(--font-sans)', 'ui-sans-serif', 'system-ui', 'sans-serif'],
        mono: ['var(--font-mono)', 'ui-monospace', 'monospace'],
      },
      fontSize: {
        xs: ['12px', { lineHeight: '16px', letterSpacing: '0' }],
        sm: ['13px', { lineHeight: '20px', letterSpacing: '0' }],
        base: ['15px', { lineHeight: '24px', letterSpacing: '0' }],
        lg: ['18px', { lineHeight: '28px', letterSpacing: '-0.005em' }],
        xl: ['22px', { lineHeight: '28px', letterSpacing: '-0.01em' }],
        '2xl': ['28px', { lineHeight: '34px', letterSpacing: '-0.015em' }],
        '3xl': ['36px', { lineHeight: '40px', letterSpacing: '-0.02em' }],
        '4xl': ['48px', { lineHeight: '50px', letterSpacing: '-0.025em' }],
        '5xl': ['64px', { lineHeight: '64px', letterSpacing: '-0.035em' }],
        // Responsive landing hero size. Use it in a plain className rather than
        // through cn(), so tailwind-merge does not read it as a text colour.
        display: ['clamp(40px, 7vw, 64px)', { lineHeight: '1', letterSpacing: '-0.035em' }],
      },
      borderRadius: {
        sm: '4px',
        DEFAULT: '6px',
        md: '6px',
        lg: '10px',
        xl: '14px',
      },
      boxShadow: {
        xs: 'var(--shadow-xs)',
        sm: 'var(--shadow-sm)',
        DEFAULT: 'var(--shadow-sm)',
        md: 'var(--shadow-md)',
        lg: 'var(--shadow-lg)',
      },
      maxWidth: {
        prose: '68ch',
      },
      transitionTimingFunction: {
        out: 'cubic-bezier(0.2, 0, 0, 1)',
        in: 'cubic-bezier(0.4, 0, 1, 1)',
      },
      transitionDuration: {
        120: '120ms',
        160: '160ms',
        180: '180ms',
        240: '240ms',
      },
      keyframes: {
        'pulse-soft': {
          '0%, 100%': { opacity: '1' },
          '50%': { opacity: '0.6' },
        },
        'node-spin': {
          from: { transform: 'rotate(0deg)' },
          to: { transform: 'rotate(360deg)' },
        },
        'progress-indeterminate': {
          '0%': { transform: 'translateX(-100%)' },
          '100%': { transform: 'translateX(250%)' },
        },
      },
      animation: {
        'pulse-soft': 'pulse-soft 1.2s ease-in-out infinite',
        'node-spin': 'node-spin 900ms linear infinite',
        'progress-indeterminate':
          'progress-indeterminate 1.4s cubic-bezier(0.4, 0, 0.2, 1) infinite',
      },
      zIndex: {
        sidebar: '30',
        topbar: '35',
        overlay: '50',
        toast: '60',
      },
    },
  },
  plugins: [],
}

export default config
