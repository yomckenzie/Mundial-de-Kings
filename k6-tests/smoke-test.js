// ═══════════════════════════════════════════════════════════
// 🔥 SMOKE TEST — Chess King App
// ═══════════════════════════════════════════════════════════
// Propósito: Verificar que los endpoints principales respondan
// Carga: 1 VU virtual durante 30 segundos
// ═══════════════════════════════════════════════════════════

import { group, sleep } from 'k6';
import { SUPABASE_URL, SUPABASE_ANON_KEY, APP_URL, THRESHOLDS, ADMIN_EMAIL, ADMIN_PASSWORD, requireAdminCreds } from './env.js';
import {
  visitPage, supabaseQuery, supabaseLogin,
  humanPause
} from './helpers.js';

export const options = {
  vus: 1,
  duration: '30s',
  thresholds: {
    http_req_duration: THRESHOLDS.http_req_duration,
    http_req_failed: THRESHOLDS.http_req_failed,
  },
};

export default function () {
  // ─── 1. Visitante anónimo navega páginas públicas ───
  group('Visitante anónimo - páginas públicas', () => {
    visitPage(APP_URL + '/', 'home');
    humanPause();

    visitPage(APP_URL + '/ranking', 'ranking');
    humanPause();

    visitPage(APP_URL + '/matches', 'matches');
    humanPause();

    visitPage(APP_URL + '/prizes', 'prizes');
    humanPause();

    visitPage(APP_URL + '/info', 'info');
    humanPause();

    visitPage(APP_URL + '/register', 'register_page');
    humanPause();

    visitPage(APP_URL + '/login', 'login_page');
    humanPause();
  });

  // ─── 2. Consultas a Supabase (API pública) ───
  group('Consultas a Supabase', () => {
    if (SUPABASE_ANON_KEY) {
      // Listar partidos
      supabaseQuery('matches', { select: '*', limit: 10 }, { type: 'public' });
      humanPause();

      // Listar premios disponibles
      supabaseQuery('prizes', { select: '*', limit: 20 }, { type: 'public' });
      humanPause();

      // Contar usuarios
      supabaseQuery('users', { select: 'id', limit: 1 }, { type: 'public' });
      humanPause();
    }
  });

  // ─── 3. Login como admin ───
  group('Login Admin', () => {
    if (SUPABASE_ANON_KEY) {
      requireAdminCreds();
      const token = supabaseLogin(ADMIN_EMAIL, ADMIN_PASSWORD);
      if (token) {
        // Login exitoso — navegar páginas protegidas
        visitPage(APP_URL + '/admin', 'admin_dashboard');
        humanPause();
      }
    }
  });

  sleep(1);
}
