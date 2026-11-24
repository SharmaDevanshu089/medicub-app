import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'

export const MEDICUB_API = process.env.MEDICUB_API ?? 'http://localhost:8788'

export default defineConfig({
  plugins: [react(), tailwindcss()],
  server: {
    port: 5174,
    proxy: { '/api': { target: MEDICUB_API, changeOrigin: true } },
  },
})
