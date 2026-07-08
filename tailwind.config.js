/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{js,ts,jsx,tsx}'],
  theme: {
    extend: {
      colors: {
        // Core surface hierarchy - deep blue-black base
        surface: {
          '0': '#06101a',
          '1': '#0a1628',
          '2': '#0e1c32',
          '3': '#122240',
          '4': '#16294a',
          '5': '#1c3155',
        },
        // Borders & separators
        edge: {
          DEFAULT: '#1a2a42',
          subtle: '#142236',
          strong: '#243a5c',
        },
        // Accent - premium gold
        accent: {
          DEFAULT: '#f7b500',
          light: '#ffc83d',
          bright: '#ffd86a',
          dim: '#b8860b',
          muted: 'rgba(247, 181, 0, 0.12)',
        },
      },
      animation: {
        spotlight: 'spotlight 2s ease .75s 1 forwards',
      },
      keyframes: {
        spotlight: {
          '0%': {
            opacity: '0',
            transform: 'translate(-72%, -62%) scale(0.5)',
          },
          '100%': {
            opacity: '1',
            transform: 'translate(-50%,-40%) scale(1)',
          },
        },
      },
    },
  },
  plugins: [],
};
