import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// Em dev, /api vai pro servidor local (dev/server.js). Em produção a Vercel
// faz esse papel com o rewrite do vercel.json.
export default defineConfig({
  plugins: [react()],
  server: {
    port: 5180,
    proxy: {
      '/api': 'http://localhost:3001',
    },
  },
})
