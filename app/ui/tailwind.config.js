/** @type {import('tailwindcss').Config} */
export default {
  content: [
    "./index.html",
    "./src/**/*.{js,ts,jsx,tsx}",
  ],
  theme: {
    extend: {
      colors: {
        // Minecraft-inspired colors
        minecraft: {
          grass: '#5D9B47',
          dirt: '#8B6B4A',
          stone: '#7F7F7F',
          bedrock: '#2F2F2F',
          diamond: '#4AEDD9',
          gold: '#FCDB02',
          iron: '#D8D8D8',
          redstone: '#FF0000',
          lapis: '#1F4CFF',
          emerald: '#17DD62'
        }
      }
    },
  },
  plugins: [],
}
