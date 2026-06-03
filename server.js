import express from 'express';
import compression from 'compression';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const app = express();
const PORT = process.env.PORT || 3000;

// ──────────────────────────────────────────
// Compression (Gzip)
// ──────────────────────────────────────────
app.use(compression());

// ──────────────────────────────────────────
// Security headers
// ──────────────────────────────────────────
app.use((_req, res, next) => {
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('X-Frame-Options', 'SAMEORIGIN');
  res.setHeader('X-XSS-Protection', '1; mode=block');
  res.setHeader('Referrer-Policy', 'strict-origin-when-cross-origin');
  next();
});

// ──────────────────────────────────────────
// Static assets (hashed filenames → immutable cache)
// ──────────────────────────────────────────
const distPath = path.join(__dirname, 'dist');

app.use(
  '/assets',
  express.static(path.join(distPath, 'assets'), {
    maxAge: '1y',
    immutable: true,
  })
);

// ──────────────────────────────────────────
// index.html → must NEVER be cached (otherwise Cloudflare serves
// stale HTML pointing to old asset hashes after a deploy, causing
// blank pages on hard reload of deep links like /ranking, /prizes).
// ──────────────────────────────────────────
app.use((req, res, next) => {
  if (req.path === '/' || req.path === '/index.html') {
    res.setHeader('Cache-Control', 'no-cache, no-store, must-revalidate');
    res.setHeader('Pragma', 'no-cache');
    res.setHeader('Expires', '0');
  }
  next();
});

// ──────────────────────────────────────────
// Other static files (images, fonts, etc.)
// ──────────────────────────────────────────
app.use(
  express.static(distPath, {
    maxAge: '1h',
  })
);

// ──────────────────────────────────────────
// SPA fallback — use middleware (more reliable than a wildcard route
// in Express 5 / path-to-regexp v6+) and never cache.
// ──────────────────────────────────────────
app.use((_req, res) => {
  res.setHeader('Cache-Control', 'no-cache, no-store, must-revalidate');
  res.setHeader('Pragma', 'no-cache');
  res.setHeader('Expires', '0');
  res.sendFile(path.join(distPath, 'index.html'));
});

// ──────────────────────────────────────────
// Start server
// ──────────────────────────────────────────
app.listen(PORT, () => {
  console.log(`[Server] Running on port ${PORT} — production mode`);
});
