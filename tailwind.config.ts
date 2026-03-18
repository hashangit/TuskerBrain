import type { Config } from 'tailwindcss';

const config: Config = {
  content: [
    './index.html',
    './src/**/*.{js,ts,jsx,tsx}',
    './electron/**/*.{js,ts,jsx,tsx}',
  ],
  theme: {
    extend: {
      colors: {
        // TuskerBrain Design System Colors
        brand: {
          DEFAULT: '#0f848a',
          50: '#e8fcfd',
          100: '#d1f9fb',
          200: '#a3f1f5',
          300: '#6ce8ed',
          400: '#2edce3',
          500: '#0f848a',
          600: '#0a585c',
          700: '#052c2e',
          800: '#031f20',
          900: '#011415',
        },
        surface: {
          DEFAULT: '#F7FAFB',
          card: '#FFFFFF',
          muted: '#EEF5F6',
          hover: '#E9F2F7',
        },
        border: {
          DEFAULT: '#CFE0E4',
          muted: '#C6D8DE',
          light: '#E5E3E8',
        },
        text: {
          primary: '#031f20',
          secondary: '#4a4653',
          muted: '#635d6f',
          subtle: '#8A96A0',
          inverse: '#FFFFFF',
        },
        // Ring color for focus states
        ring: {
          brand: '#0f848a',
        },
        // Legacy primary colors for backwards compatibility
        primary: {
          50: '#e8fcfd',
          100: '#d1f9fb',
          200: '#a3f1f5',
          300: '#6ce8ed',
          400: '#2edce3',
          500: '#0f848a',
          600: '#0a585c',
          700: '#052c2e',
          800: '#031f20',
          900: '#011415',
          950: '#082f49',
        },
      },
      fontFamily: {
        sans: ['Inter', '-apple-system', 'BlinkMacSystemFont', 'Segoe UI', 'Roboto', 'sans-serif'],
        display: ['Manrope', 'Inter', 'sans-serif'],
        mono: ['JetBrains Mono', 'SF Mono', 'Monaco', 'Inconsolata', 'Fira Mono', 'monospace'],
      },
      borderRadius: {
        'card': '12px',
        'modal': '16px',
      },
      boxShadow: {
        'card': '0 2px 8px rgba(11, 74, 83, 0.06)',
        'card-hover': '0 4px 16px rgba(11, 74, 83, 0.1)',
        'modal': '0 10px 40px rgba(11, 74, 83, 0.15)',
        'button': '0 4px 10px rgba(3, 31, 32, 0.12)',
      },
      ringWidth: {
        DEFAULT: '2px',
      },
    },
  },
  plugins: [],
};

export default config;
