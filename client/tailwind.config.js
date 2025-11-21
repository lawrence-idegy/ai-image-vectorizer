/** @type {import('tailwindcss').Config} */
export default {
  content: [
    "./index.html",
    "./src/**/*.{js,ts,jsx,tsx}",
  ],
  theme: {
    extend: {
      colors: {
        idegy: {
          blue: '#0076CE',
          teal: '#00B2A9',
          darkblue: '#003D5C',
          lightblue: '#E6F4F8',
          gray: '#F5F7FA',
        }
      },
      fontFamily: {
        sans: ['Inter', 'system-ui', 'sans-serif'],
      },
    },
  },
  plugins: [],
}
