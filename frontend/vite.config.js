import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import basicSsl from '@vitejs/plugin-basic-ssl'

// host: true lets your phone reach the dev server over Wi-Fi.
// /api is proxied to the Python backend so the phone only needs one address.
export default defineConfig({
  // HTTPS=1 serves a self-signed certificate: phones only allow the live camera on https (or localhost).
  plugins: [react(), ...(process.env.HTTPS ? [basicSsl()] : [])],
  test: { environment: 'node', include: ['src/**/*.test.js'] },
  server: {
    host: true,
    port: 5173,
    proxy: { '/api': 'http://127.0.0.1:8000' },
  },
})
