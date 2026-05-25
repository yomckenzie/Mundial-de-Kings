import react from '@vitejs/plugin-react'
import { defineConfig } from 'vite'
import path from 'path'
import { fileURLToPath } from 'url'
import fs from 'fs'

const __dirname = path.dirname(fileURLToPath(import.meta.url))

// Plugin para base de datos compartida en la red local
function sharedDbPlugin() {
  const dbPath = path.resolve(__dirname, 'shared-db.json')
  return {
    name: 'shared-db',
    configureServer(server) {
      // Inicializar archivo si no existe
      if (!fs.existsSync(dbPath)) {
        fs.writeFileSync(dbPath, JSON.stringify({}))
        console.log('[SharedDB] Archivo shared-db.json creado')
      }

      server.middlewares.use('/api/shared-db', (req, res, next) => {
        // GET: obtener toda la base de datos compartida
        if (req.method === 'GET') {
          try {
            const data = fs.readFileSync(dbPath, 'utf-8')
            res.setHeader('Content-Type', 'application/json')
            res.setHeader('Cache-Control', 'no-store')
            res.end(data)
          } catch (err) {
            res.statusCode = 500
            res.end(JSON.stringify({ error: err.message }))
          }
          return
        }

        // POST: guardar la base de datos compartida
        if (req.method === 'POST') {
          let body = ''
          req.on('data', chunk => { body += chunk })
          req.on('end', () => {
            try {
              // Validar que sea JSON válido
              JSON.parse(body)
              fs.writeFileSync(dbPath, body)
              res.setHeader('Content-Type', 'application/json')
              res.end(JSON.stringify({ success: true }))
            } catch (err) {
              res.statusCode = 500
              res.end(JSON.stringify({ error: err.message }))
            }
          })
          return
        }

        next()
      })
    },
  }
}

export default defineConfig({
  logLevel: 'error',
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src'),
    },
  },
  plugins: [
    react(),
    sharedDbPlugin(),
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
          proxy.on('error', (err) => {
            console.error('[Proxy error]', err.message);
          });
        },
      },
      // football-data.org (GRATIS - resultados post-partido)
      '/api/football-data': {
        target: 'https://api.football-data.org',
        changeOrigin: true,
        configure: (proxy) => {
          proxy.on('error', (err) => {
            console.error('[Football-Data Proxy error]', err.message);
          });
        },
      },
    },
  },
});