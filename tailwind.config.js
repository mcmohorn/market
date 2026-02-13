/** @type {import('tailwindcss').Config} */
export default {
  content: ["./client/**/*.{js,ts,jsx,tsx}", "./client/index.html"],
  theme: {
    extend: {
      colors: {
        cyber: {
          bg: '#0a0a0a',
          panel: '#111111',
          border: '#1a1a2e',
          green: '#00ff88',
          'green-dim': '#00cc6a',
          'green-glow': '#00ff8840',
          red: '#ff3366',
          'red-dim': '#cc2952',
          yellow: '#ffcc00',
          blue: '#00aaff',
          muted: '#666677',
          text: '#e0e0e0',
        }
      },
      fontFamily: {
        mono: ['JetBrains Mono', 'Fira Code', 'monospace'],
      },
    },
  },
  plugins: [],
};
