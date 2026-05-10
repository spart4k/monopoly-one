/** @type {import('tailwindcss').Config} */
export default {
  content: [
    "./index.html",
    "./src/**/*.{vue,js,ts,jsx,tsx}",
  ],
  theme: {
    extend: {
      gridTemplateColumns: {
        '11': 'repeat(11, minmax(0, 1fr))',
      },
      gridTemplateRows: {
        '11': 'repeat(11, minmax(0, 1fr))',
      },
      colors: {
        monopoly: {
          brown: '#8B4513',
          lightBlue: '#87CEEB',
          pink: '#FF69B4',
          orange: '#FFA500',
          red: '#FF0000',
          yellow: '#FFD700',
          green: '#008000',
          darkBlue: '#00008B',
        }
      }
    },
  },
  plugins: [],
}