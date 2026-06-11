// ═══════════════════════════════════════════════════════════
// 🧪 SOAK TEST — Chess King App
// ═══════════════════════════════════════════════════════════
// Propósito: Detectar memory leaks y degradación con el tiempo
// Carga: 30 VUs constantes durante 30 minutos
// ═══════════════════════════════════════════════════════════

import { group } from 'k6';
import { SUPABASE_ANON_KEY, APP_URL, ADMIN_EMAIL, ADMIN_PASSWORD, requireAdminCreds } from './env.js';
import {
  visitPage, supabaseQuery, supabaseLogin,
  humanPause
} from './helpers.js';

export const options = {
  stages: [
    { duration: '1m', target: 30 },     // Rampa subiendo
    { duration: '28m', target: 30 },    // Mantener 30 VUs por 28 min
    { duration: '1m', target: 0 },      // Bajando
  ],
  thresholds: {
    http_req_duration: ['p(95)<3000', 'p(99)<5000', 'max<10000'],
    http_req_failed: ['rate<0.05'],
  },
};

export default function () {
  const hasSupabase = !!SUPABASE_ANON_KEY;

  // Ciclo completo de un usuario real
  group('Soak - ciclo completo', () => {
    // 1. Inicio
    visitPage(APP_URL + '/', 'soak_home');
    humanPause();

    // 2. Ranking
    visitPage(APP_URL + '/ranking', 'soak_ranking');
    if (hasSupabase) {
      supabaseQuery('users', {
        select: 'id,email,total_points,prediction_points',
        order: 'total_points.desc.nullslast',
        limit: 100,
      }, { type: 'soak_ranking' });
    }
    humanPause();

    // 3. Partidos
    visitPage(APP_URL + '/matches', 'soak_matches');
    if (hasSupabase) {
      supabaseQuery('matches', {
        select: '*',
        order: 'match_date.asc',
        limit: 50,
      }, { type: 'soak_matches' });
    }
    humanPause();

    // 4. Premios
    visitPage(APP_URL + '/prizes', 'soak_prizes');
    if (hasSupabase) {
      supabaseQuery('prizes', { select: '*', limit: 20 }, { type: 'soak_prizes' });
    }
    humanPause();

    // 5. Info
    visitPage(APP_URL + '/info', 'soak_info');
    humanPause();

    // 6. Login / Admin (algunos VUs)
    if (__VU <= 5 && hasSupabase) {
      requireAdminCreds();
      const token = supabaseLogin(ADMIN_EMAIL, ADMIN_PASSWORD);
      if (token) {
        visitPage(APP_URL + '/admin', 'soak_admin');
        humanPause();
        visitPage(APP_URL + '/admin/users', 'soak_admin_users');
        humanPause();
        visitPage(APP_URL + '/admin/matches', 'soak_admin_matches');
      }
    }
  });

  // Pausa más larga para simular tiempo de "lectura"
  sleep(3 + Math.random() * 5);
}
