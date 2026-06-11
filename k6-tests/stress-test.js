// ═══════════════════════════════════════════════════════════
// 💥 STRESS TEST — Chess King App
// ═══════════════════════════════════════════════════════════
// Propósito: Encontrar el punto de quiebre del sistema
// Carga: Rampa progresiva 0 → 200 VUs en 8 minutos
// ═══════════════════════════════════════════════════════════

import { group } from 'k6';
import { SUPABASE_ANON_KEY, APP_URL, ADMIN_EMAIL, ADMIN_PASSWORD, requireAdminCreds } from './env.js';
import {
  visitPage, supabaseQuery, supabaseLogin,
  humanPause
} from './helpers.js';

export const options = {
  stages: [
    { duration: '2m', target: 20 },    // 0 → 20 VUs
    { duration: '2m', target: 50 },    // 20 → 50 VUs
    { duration: '2m', target: 100 },   // 50 → 100 VUs
    { duration: '2m', target: 200 },   // 100 → 200 VUs
    { duration: '2m', target: 200 },   // Mantener 200 VUs
    { duration: '1m', target: 0 },     // Bajando
  ],
  thresholds: {
    http_req_duration: ['p(95)<5000', 'p(99)<10000'],
    http_req_failed: ['rate<0.20'],
  },
};

export default function () {
  const hasSupabase = !!SUPABASE_ANON_KEY;
  const scenario = __VU % 4; // 4 tipos de usuario

  switch (scenario) {
    // ─── Visitante (25%): solo páginas públicas ───
    case 0:
      group('Visitante', () => {
        visitPage(APP_URL + '/', 'home');
        humanPause();
        visitPage(APP_URL + '/ranking', 'ranking');
        humanPause();
        visitPage(APP_URL + '/matches', 'matches');
        humanPause();
        visitPage(APP_URL + '/info', 'info');
      });
      break;

    // ─── Usuario viendo ranking (25%) ───
    case 1:
      group('Ranking-heavy', () => {
        visitPage(APP_URL + '/ranking', 'ranking');
        if (hasSupabase) {
          supabaseQuery('users', {
            select: 'id,email,total_points,prediction_points',
            order: 'total_points.desc.nullslast',
            limit: 200,
          }, { type: 'ranking_heavy' });
        }
        humanPause();
        visitPage(APP_URL + '/prizes', 'prizes');
      });
      break;

    // ─── Admin navegando (25%) ───
    case 2:
      group('Admin', () => {
        if (hasSupabase) {
          requireAdminCreds();
          const token = supabaseLogin(ADMIN_EMAIL, ADMIN_PASSWORD);
          if (token) {
            visitPage(APP_URL + '/admin', 'admin_dashboard');
            humanPause();
            visitPage(APP_URL + '/admin/matches', 'admin_matches');
            humanPause();
            visitPage(APP_URL + '/admin/users', 'admin_users');
          }
        }
      });
      break;

    // ─── Mix de consultas pesadas (25%) ───
    case 3:
      group('Consultas pesadas', () => {
        visitPage(APP_URL + '/', 'home');
        if (hasSupabase) {
          supabaseQuery('matches', { select: '*', limit: 100 }, { type: 'heavy_matches' });
          humanPause();
          supabaseQuery('predictions', { select: '*', limit: 100 }, { type: 'heavy_predictions' });
          humanPause();
          supabaseQuery('users', { select: 'id,email,full_name,role,instagram,total_points', limit: 200 }, { type: 'heavy_users' });
        }
      });
      break;
  }

  sleep(1);
}
