import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'

/** The permanent Medicub server. Set MEDICUB_API=http://localhost:8787 to develop against a local `npm run server`. */
export const MEDICUB_API = process.env.MEDICUB_API ?? 'https://medicub.vercel.app'

export default defineConfig(({ mode }) => ({
  plugins: [react(), tailwindcss()],
  // public/ holds the downloadable APK; the Android build itself must not contain it.
  publicDir: mode === 'patient' ? false : 'public',
  server: {
    port: 5173,
    proxy: { '/api': { target: MEDICUB_API, changeOrigin: true, secure: true } },
  },
}))
