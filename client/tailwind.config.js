/** @type {import('tailwindcss').Config} */
export default {
  darkMode: 'class',
  content: [
    "./index.html",
    "./src/**/*.{js,ts,jsx,tsx}",
  ],
  theme: {
    screens: {
      'xs': '480px',
      'sm': '640px',
      'md': '768px',
      'lg': '1024px',
      'xl': '1280px',
      '2xl': '1536px',
    },
    extend: {
      colors: {
        idegy: {
          navy: '#0D2240',
          red: '#E63329',
          'navy-light': '#1A3A5C',
          'navy-dark': '#081828',
          'red-light': '#FF4D42',
          'red-dark': '#C42A21',
          gray: '#F5F7FA',
          blue: '#4A9FE5', // Light accent for dark mode visibility
          teal: '#38BDF8', // Bright accent for dark mode
        }
      },
      fontFamily: {
        sans: ['Inter', 'system-ui', 'sans-serif'],
      },
    },
  },
  plugins: [],
}
