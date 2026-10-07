import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// host: true lets your phone reach the dev server over Wi-Fi.
// /api is proxied to the Python backend so the phone only needs one address.
export default defineConfig({
  plugins: [react()],
  server: {
    host: true,
    port: 5173,
    proxy: { '/api': 'http://127.0.0.1:8000' },
  },
})
