/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{js,jsx}'],
  darkMode: 'class',
  theme: {
    extend: {
      fontFamily: {
        sans: ['Montserrat', 'system-ui', 'sans-serif'],
      },
      colors: {
        hypr: {
          cyan: '#2DA0DE',
          'cyan-light': '#5FB8E8',
          'cyan-dark': '#1A7DB5',
          'cyan-soft': '#9FD4E8',
          pink: '#E85A7A',
          'pink-soft': '#F4C2CE',
        },
        ink: {
          white: '#FFFFFF',
          50: '#FAFBFC',
          100: '#F5F6F8',
          200: '#EBEDF1',
          300: '#D5D8DE',
          400: '#9CA1AB',
          500: '#6B7280',
          600: '#3F4651',
          700: '#1F242E',
          800: '#11151D',
          900: '#0B0E14',
          dark: '#0F1830',
        },
      },
      animation: {
        'fade-in': 'fadeIn 0.2s ease-out',
        'slide-up': 'slideUp 0.25s ease-out',
        'scale-in': 'scaleIn 0.18s ease-out',
      },
      keyframes: {
        fadeIn: { '0%': { opacity: '0' }, '100%': { opacity: '1' } },
        slideUp: {
          '0%': { opacity: '0', transform: 'translateY(8px)' },
          '100%': { opacity: '1', transform: 'translateY(0)' },
        },
        scaleIn: {
          '0%': { opacity: '0', transform: 'scale(0.96)' },
          '100%': { opacity: '1', transform: 'scale(1)' },
        },
      },
    },
  },
  plugins: [],
};
