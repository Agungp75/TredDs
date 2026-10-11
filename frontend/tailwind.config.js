/** @type {import('tailwindcss').Config} */
export default {
  content: [
    "./index.html",
    "./src/**/*.{js,ts,jsx,tsx}",
  ],
  darkMode: 'class',
  theme: {
    extend: {
      colors: {
        background: '#09090b',
        surface: '#0c0c0f',
        'surface-dim': '#0c0c0f',
        'surface-bright': '#18181b',
        'surface-variant': '#18181b',
        'surface-container-lowest': '#09090b',
        'surface-container-low': '#0f0f12',
        'surface-container': '#121215',
        'surface-container-high': '#18181b',
        'surface-container-highest': '#1e1e22',
        outline: '#52525b',
        'outline-variant': '#27272a',
        primary: '#a78bfa',
        'primary-container': '#7c3aed',
        'primary-fixed': '#ede9fe',
        'on-primary': '#0a0012',
        'on-primary-container': '#ede9fe',
        secondary: '#71717a',
        'secondary-container': '#27272a',
        tertiary: '#34d399',
        'tertiary-container': '#065f46',
        'tertiary-fixed': '#bbf7d0',
        error: '#ef4444',
        'error-container': '#3b1111',
        'on-surface': '#fafafa',
        'on-surface-variant': '#a1a1aa',
        'on-background': '#fafafa',
        brand: {
          dark: '#09090b',
          card: '#121215',
          surface: '#18181b',
          border: '#27272a',
          accent: '#a78bfa',
          green: '#34d399',
          red: '#ef4444',
          yellow: '#f59e0b'
        }
      },
      fontFamily: {
        headline: ['Geist', 'sans-serif'],
        display: ['Geist', 'sans-serif'],
        body: ['Geist', 'sans-serif'],
        label: ['Geist', 'sans-serif'],
        mono: ['JetBrains Mono', 'monospace'],
      }
    },
  },
  plugins: [],
}
