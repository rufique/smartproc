/** @type {import('tailwindcss').Config} */
module.exports = {
  content: ['./app/**/*.{js,ts,tsx}', './components/**/*.{js,ts,tsx}'],

  presets: [require('nativewind/preset')],
  theme: {
    extend: {
      colors: {
        brand: {
          DEFAULT: '#5B7FA6',
          dark: '#4A6B8C',
          light: '#E7EEF7',
        },
        ink: '#0F172B',
        sub: '#64748B',
        muted: '#94A3B8',
        line: '#E7ECF2',
        canvas: '#F5F7FA',
        link: '#2F6FEB',
        success: '#16A34A',
        warning: '#F97316',
        danger: '#EF4444',
        info: '#3B82F6',
      },
    },
  },
  plugins: [],
};
