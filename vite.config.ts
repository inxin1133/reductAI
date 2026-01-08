import path from "path"
import tailwindcss from "@tailwindcss/vite"
import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// https://vite.dev/config/
export default defineConfig(() => {
  // Docker 환경에서 실행 시 환경변수 사용, 로컬 실행 시 localhost 사용
  const authTarget = process.env.AUTH_SERVICE_URL || 'http://localhost:3001';
  const userTarget = process.env.USER_SERVICE_URL || 'http://localhost:3002';
  const tenantTarget = process.env.TENANT_SERVICE_URL || 'http://localhost:3003';
  const i18nTarget = process.env.I18N_SERVICE_URL || 'http://localhost:3006';
  const aiAgentTarget = process.env.AI_AGENT_SERVICE_URL || 'http://localhost:3007';
  const postTarget = process.env.POST_SERVICE_URL || 'http://localhost:3005';

  return {
    plugins: [react(), tailwindcss()],
    resolve: {
      alias: {
        "@": path.resolve(__dirname, "./src"),
      },
    },
    server: {
      proxy: {
        '/auth': {
          target: authTarget,
          changeOrigin: true,
        },
        '/api/users': {
          target: userTarget,
          changeOrigin: true,
        },
        '/api/roles': {
          target: userTarget,
          changeOrigin: true,
        },
        '/api/permissions': {
          target: userTarget,
          changeOrigin: true,
        },
        '/api/tenants': {
          target: tenantTarget,
          changeOrigin: true,
        },
        '/api/i18n': {
          target: i18nTarget,
          changeOrigin: true,
        },
        '/api/ai': {
          target: aiAgentTarget,
          changeOrigin: true,
        },
        '/api/posts': {
          target: postTarget,
          changeOrigin: true,
        },
      }
    }
  }
})
