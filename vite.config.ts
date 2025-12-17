import path from "path"
import tailwindcss from "@tailwindcss/vite"
import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// https://vite.dev/config/
export default defineConfig({
  plugins: [react(), tailwindcss()],
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "./src"),
    },
  },
  server: {
    proxy: {
      '/auth': {
        target: 'http://localhost:3001',
        changeOrigin: true,
      },
      '/api/users': {
        target: 'http://localhost:3002',
        changeOrigin: true,
      },
      '/api/roles': {
        target: 'http://localhost:3002',
        changeOrigin: true,
      },
      '/api/permissions': {
        target: 'http://localhost:3002',
        changeOrigin: true,
      },
      '/api/tenants': {
        target: 'http://localhost:3003',
        changeOrigin: true,
      },
      '/api/i18n': {
        target: 'http://localhost:3006',
        changeOrigin: true,
      },
    }
  }
})
