import type { Config } from 'tailwindcss'

const config: Config = {
  content: [
    './app/**/*.{js,ts,jsx,tsx,mdx}',
    './components/**/*.{js,ts,jsx,tsx,mdx}',
  ],
  theme: {
    extend: {
      colors: {
        bg: {
          primary: '#0d0f14',
          secondary: '#151820',
          tertiary: '#1e2330',
          hover: '#252b3b',
        },
        border: '#1e2330',
        green: { DEFAULT: '#22c55e', muted: '#15803d20' },
        red: { DEFAULT: '#ef4444', muted: '#dc262620' },
        amber: { DEFAULT: '#f59e0b', muted: '#d9770620' },
        blue: { DEFAULT: '#3b82f6', muted: '#1d4ed820' },
        indigo: { DEFAULT: '#818cf8', muted: '#4338ca20' },
        purple: { DEFAULT: '#a78bfa' },
      },
      fontFamily: {
        sans: ['Inter', 'system-ui', 'sans-serif'],
        mono: ['JetBrains Mono', 'Fira Code', 'monospace'],
      },
    },
  },
  plugins: [],
}

export default config
