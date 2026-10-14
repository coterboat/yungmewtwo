import tailwindcss from '@tailwindcss/vite'
import react from '@vitejs/plugin-react'
import { defineConfig } from 'vite'

// Relative base + hash routing: the same build works on GitHub Pages (/yungmewtwo/) and locally.
export default defineConfig({
  base: './',
  plugins: [react(), tailwindcss()],
})
