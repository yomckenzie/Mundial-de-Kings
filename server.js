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
// Other static files (images, fonts, etc.)
// ──────────────────────────────────────────
app.use(
  express.static(distPath, {
    maxAge: '1h',
  })
);

// ──────────────────────────────────────────
// SPA fallback — all routes serve index.html
// ──────────────────────────────────────────
app.get('*', (_req, res) => {
  res.sendFile(path.join(distPath, 'index.html'));
});

// ──────────────────────────────────────────
// Start server
// ──────────────────────────────────────────
app.listen(PORT, () => {
  console.log(`[Server] Running on port ${PORT} — production mode`);
});
