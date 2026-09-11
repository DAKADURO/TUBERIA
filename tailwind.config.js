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
        cad: {
          bg: '#14171c',
          panel: '#1b2028',
          border: '#2a323d',
          accent: '#007acc',
          hover: '#242b36',
          active: '#0e639c',
          text: '#e1e4e8',
          muted: '#8b949e',
          grid: '#222831',
        },
      },
      fontFamily: {
        mono: ['Fira Code', 'Consolas', 'Courier New', 'monospace'],
      },
    },
  },
  plugins: [],
};
