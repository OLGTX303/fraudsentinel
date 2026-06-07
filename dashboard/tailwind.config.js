/** @type {import('tailwindcss').Config} */
// Colors are CSS variables (R G B channels) so the whole UI re-themes by
// swapping the variables on <html> (.light / .dark) — see index.css.
const v = (name) => `rgb(var(${name}) / <alpha-value>)`

export default {
  darkMode: 'class',
  content: ['./index.html', './src/**/*.{js,jsx}'],
  theme: {
    extend: {
      colors: {
        ink:     v('--c-ink'),
        surface: v('--c-surface'),
        panel:   v('--c-panel'),
        raised:  v('--c-raised'),
        line:    v('--c-line'),
        line2:   v('--c-line2'),
        txt:     v('--c-txt'),
        sub:     v('--c-sub'),
        muted:   v('--c-muted'),
        brand:   v('--c-brand'),
        onbrand: v('--c-onbrand'),   // text color that sits on a brand-filled surface
        branddim:v('--c-branddim'),
        allow:   v('--c-allow'),
        flag:    v('--c-flag'),
        block:   v('--c-block'),
        crit:    v('--c-block'),
        high:    v('--c-high'),
        med:     v('--c-brand'),
        low:     v('--c-muted'),
      },
      fontFamily: {
        sans: ['Inter Variable', 'Inter', 'system-ui', 'sans-serif'],
        mono: ['JetBrains Mono Variable', 'ui-monospace', 'SFMono-Regular', 'monospace'],
      },
      fontSize: {
        '2xs': ['0.6875rem', { lineHeight: '0.875rem' }],
      },
      boxShadow: {
        glow: '0 0 0 1px rgb(var(--c-brand) / 0.25), 0 0 22px -6px rgb(var(--c-brand) / 0.4)',
        panel: 'var(--shadow-panel)',
      },
      keyframes: {
        scan: { '0%': { transform: 'translateY(-100%)' }, '100%': { transform: 'translateY(400%)' } },
        ping2: { '75%,100%': { transform: 'scale(2.4)', opacity: '0' } },
        aurora: {
          '0%,100%': { transform: 'translate(-10%,-10%) rotate(0deg)' },
          '50%': { transform: 'translate(10%,10%) rotate(8deg)' },
        },
        shimmer: { '0%': { backgroundPosition: '-200% 0' }, '100%': { backgroundPosition: '200% 0' } },
      },
      animation: {
        scan: 'scan 2.4s linear infinite',
        ping2: 'ping2 1.4s cubic-bezier(0,0,0.2,1) infinite',
        aurora: 'aurora 18s ease-in-out infinite',
        shimmer: 'shimmer 3s linear infinite',
      },
    },
  },
  plugins: [],
}
