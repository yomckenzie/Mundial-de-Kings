import react from '@vitejs/plugin-react'
import { defineConfig } from 'vite'
import path from 'path'
import { fileURLToPath } from 'url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))

export default defineConfig({
  test: {
    environment: 'jsdom',
    globals: true,
    exclude: ['**/node_modules/**', '**/dist/**', '**/.claude/**'],
  },
  logLevel: 'error',
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src'),
    },
  },
  plugins: [
    react(),
  ],
  server: {
    host: true, // permite conexiones desde la misma red
    proxy: {
      // API-Football (RapidAPI - PAGA ~$19/mes para Mundial 2026)
      '/api-football': {
        target: 'https://api-football-v1.p.rapidapi.com',
        changeOrigin: true,
        rewrite: (path) => path.replace(/^\/api-football/, ''),
        configure: (proxy) => {
          proxy.on('error', () => {});
        },
      },
      // football-data.org (GRATIS - resultados post-partido)
      '/api/football-data': {
        target: 'https://api.football-data.org',
        changeOrigin: true,
        configure: (proxy) => {
          proxy.on('error', () => {});
        },
      },
    },
  },
});
