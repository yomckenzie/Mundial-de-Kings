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
  },
  // Cabeceras de seguridad para el servidor de producción (vite preview en Railway).
  // NO se aplican al dev server (romperían el HMR por el CSP/eval).
  preview: {
    host: true,
    headers: {
      'Strict-Transport-Security': 'max-age=63072000; includeSubDomains; preload',
      'X-Content-Type-Options': 'nosniff',
      'X-Frame-Options': 'SAMEORIGIN',
      'Referrer-Policy': 'strict-origin-when-cross-origin',
      'Cross-Origin-Opener-Policy': 'same-origin',
      'Permissions-Policy': 'geolocation=(), camera=(), microphone=()',
      // CSP permisivo-pero-presente: habilita exactamente los orígenes que usa la
      // app (Supabase, fuentes Google, SportScore, Brevo, Meta Pixel). 'unsafe-inline'
      // es necesario por los scripts inline (tema + pixel) y estilos de Tailwind.
      'Content-Security-Policy': [
        "default-src 'self'",
        "script-src 'self' 'unsafe-inline' https://connect.facebook.net",
        "style-src 'self' 'unsafe-inline' https://fonts.googleapis.com",
        "font-src 'self' https://fonts.gstatic.com",
        "img-src 'self' data: blob: https:",
        "connect-src 'self' https://khrxddafhzvfdyivysay.supabase.co wss://khrxddafhzvfdyivysay.supabase.co https://sportscore.com https://api.brevo.com https://www.facebook.com https://connect.facebook.net",
        "frame-src https://www.facebook.com",
        "object-src 'none'",
        "base-uri 'self'",
      ].join('; '),
    },
  },
});
