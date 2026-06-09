// ═══════════════════════════════════════════════════════════
// 🚀 LOAD TEST — Chess King App
// ═══════════════════════════════════════════════════════════
// Propósito: Simular carga normal de usuarios simultáneos
// Carga: 50 VUs durante 5 minutos (rampa gradual)
// ═══════════════════════════════════════════════════════════

import { group } from 'k6';
import { SUPABASE_ANON_KEY, APP_URL, THRESHOLDS } from './env.js';
import {
  visitPage, supabaseQuery, supabaseLogin,
  humanPause
} from './helpers.js';

export const options = {
  stages: [
    { duration: '1m', target: 10 },   // Rampa subiendo a 10
    { duration: '2m', target: 30 },   // Subiendo a 30
    { duration: '1m', target: 50 },   // Subiendo a 50
    { duration: '30s', target: 50 },  // Mantener 50
    { duration: '30s', target: 0 },   // Bajando
  ],
  thresholds: {
    http_req_duration: ['p(95)<3000', 'p(99)<6000'],
    http_req_failed: ['rate<0.10'],
  },
};

export default function () {
  const hasSupabase = !!SUPABASE_ANON_KEY;
  let token = null;

  // ─── 1. Home ───
  group('Home - Landing', () => {
    visitPage(APP_URL + '/', 'home');

    if (hasSupabase) {
      supabaseQuery('matches', { select: '*', limit: 5 }, { type: 'home' });
    }
    humanPause();
  });

  // ─── 2. Ranking ───
  group('Ranking', () => {
    visitPage(APP_URL + '/ranking', 'ranking');

    if (hasSupabase) {
      supabaseQuery('users', {
        select: 'id,email,full_name,total_points,prediction_points',
        order: 'total_points.desc.nullslast',
        limit: 100,
      }, { type: 'ranking' });
    }
    humanPause();
  });

  // ─── 3. Partidos ───
  group('Partidos (Matches)', () => {
    visitPage(APP_URL + '/matches', 'matches');

    if (hasSupabase) {
      supabaseQuery('matches', {
        select: '*',
        order: 'match_date.asc',
        limit: 50,
      }, { type: 'matches' });
    }
    humanPause();
  });

  // ─── 4. Premios ───
  group('Premios (Prizes)', () => {
    visitPage(APP_URL + '/prizes', 'prizes');

    if (hasSupabase) {
      supabaseQuery('prizes', { select: '*', limit: 20 }, { type: 'prizes' });
    }
    humanPause();
  });

  // ─── 5. Login y páginas protegidas ───
  group('Login + perfil', () => {
    if (hasSupabase) {
      token = supabaseLogin('admin@chessking.com', 'admin123');
      if (token) {
        visitPage(APP_URL + '/profile', 'profile');
        humanPause();
        visitPage(APP_URL + '/admin', 'admin_dashboard');
        humanPause();
      }
    }
  });

  // ─── 6. Info ───
  group('Info', () => {
    visitPage(APP_URL + '/info', 'info');
    humanPause();

    if (hasSupabase) {
      supabaseQuery('app_settings', { select: '*', key: 'eq.info_sections' }, { type: 'info' });
    }
  });
}
