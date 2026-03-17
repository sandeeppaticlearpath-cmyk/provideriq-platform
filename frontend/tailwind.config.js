/** @type {import('tailwindcss').Config} */
module.exports = {
  content: [
    './src/pages/**/*.{js,ts,jsx,tsx,mdx}',
    './src/components/**/*.{js,ts,jsx,tsx,mdx}',
    './src/app/**/*.{js,ts,jsx,tsx,mdx}',
  ],
  theme: {
    extend: {
      fontFamily: {
        sans: ['var(--font-geist-sans)', 'system-ui', 'sans-serif'],
        display: ['var(--font-dm-serif)', 'Georgia', 'serif'],
        mono: ['var(--font-geist-mono)', 'monospace'],
      },
      colors: {
        // ProviderIQ Brand System
        brand: {
          50:  '#f0f4ff',
          100: '#e2eaff',
          200: '#c7d5ff',
          300: '#a3b9ff',
          400: '#7b95ff',
          500: '#5570f4',  // Primary
          600: '#3d52e0',
          700: '#3040c5',
          800: '#29369f',
          900: '#27317e',
          950: '#181d4a',
        },
        slate: {
          25: '#fafbfc',
          50: '#f8fafc',
          100: '#f1f5f9',
          200: '#e2e8f0',
          300: '#cbd5e1',
          400: '#94a3b8',
          500: '#64748b',
          600: '#475569',
          700: '#334155',
          800: '#1e293b',
          900: '#0f172a',
          950: '#020617',
        },
        // Status colors
        emerald: {
          50: '#ecfdf5',
          100: '#d1fae5',
          500: '#10b981',
          600: '#059669',
        },
        amber: {
          50: '#fffbeb',
          100: '#fef3c7',
          500: '#f59e0b',
          600: '#d97706',
        },
        rose: {
          50: '#fff1f2',
          100: '#ffe4e6',
          500: '#f43f5e',
          600: '#e11d48',
        },
        violet: {
          50: '#f5f3ff',
          100: '#ede9fe',
          500: '#8b5cf6',
          600: '#7c3aed',
        },
        // Pipeline stage colors
        stage: {
          sourced:    '#6366f1',
          contacted:  '#8b5cf6',
          interested: '#ec4899',
          submitted:  '#f59e0b',
          interview:  '#3b82f6',
          offer:      '#10b981',
          placed:     '#059669',
        },
      },
      boxShadow: {
        'card':     '0 1px 3px rgba(0,0,0,0.04), 0 4px 12px rgba(0,0,0,0.04)',
        'card-md':  '0 2px 8px rgba(0,0,0,0.06), 0 8px 24px rgba(0,0,0,0.06)',
        'card-lg':  '0 4px 16px rgba(0,0,0,0.08), 0 16px 48px rgba(0,0,0,0.08)',
        'glow':     '0 0 0 3px rgba(85, 112, 244, 0.15)',
        'glow-sm':  '0 0 0 2px rgba(85, 112, 244, 0.12)',
        'inner-sm': 'inset 0 1px 2px rgba(0,0,0,0.06)',
      },
      borderRadius: {
        'xl':  '12px',
        '2xl': '16px',
        '3xl': '24px',
      },
      animation: {
        'fade-in':      'fadeIn 0.2s ease-out',
        'slide-up':     'slideUp 0.25s cubic-bezier(0.4, 0, 0.2, 1)',
        'slide-in-left':'slideInLeft 0.25s cubic-bezier(0.4, 0, 0.2, 1)',
        'scale-in':     'scaleIn 0.15s cubic-bezier(0.4, 0, 0.2, 1)',
        'pulse-soft':   'pulseSoft 2s ease-in-out infinite',
        'shimmer':      'shimmer 1.5s ease-in-out infinite',
      },
      keyframes: {
        fadeIn:      { from: { opacity: 0 }, to: { opacity: 1 } },
        slideUp:     { from: { opacity: 0, transform: 'translateY(8px)' }, to: { opacity: 1, transform: 'translateY(0)' } },
        slideInLeft: { from: { opacity: 0, transform: 'translateX(-12px)' }, to: { opacity: 1, transform: 'translateX(0)' } },
        scaleIn:     { from: { opacity: 0, transform: 'scale(0.96)' }, to: { opacity: 1, transform: 'scale(1)' } },
        pulseSoft:   { '0%,100%': { opacity: 1 }, '50%': { opacity: 0.7 } },
        shimmer:     { '0%': { backgroundPosition: '-200% 0' }, '100%': { backgroundPosition: '200% 0' } },
      },
      backgroundImage: {
        'gradient-radial': 'radial-gradient(var(--tw-gradient-stops))',
        'shimmer-gradient': 'linear-gradient(90deg, transparent 0%, rgba(255,255,255,0.5) 50%, transparent 100%)',
      },
      spacing: {
        '18': '4.5rem',
        '22': '5.5rem',
        '88': '22rem',
        '112': '28rem',
        '128': '32rem',
      },
    },
  },
  plugins: [],
};
