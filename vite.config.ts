import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'
import { defineConfig } from 'vite'

export default defineConfig({
  server: { proxy: { '/api': { target: 'http://127.0.0.1:8787', timeout: 120000, proxyTimeout: 120000 } } },
  plugins: [react(), tailwindcss()],
})
