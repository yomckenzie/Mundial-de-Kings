// ═══════════════════════════════════════════════════════════
// ⚡ SPIKE TEST — Chess King App
// ═══════════════════════════════════════════════════════════
// Propósito: Simular un pico repentino de tráfico
// (ej: publicación en redes sociales, inicio de un partido)
// Carga: 0 → 100 VUs en 5 segundos, mantener 1 minuto
// ═══════════════════════════════════════════════════════════

import { group } from 'k6';
import { SUPABASE_ANON_KEY, APP_URL } from './env.js';
import {
  visitPage, supabaseQuery,
  humanPause
} from './helpers.js';

export const options = {
  stages: [
    { duration: '5s', target: 100 },    // PICO: 0 → 100 en 5s
    { duration: '1m', target: 100 },    // Mantener 100 VUs
    { duration: '30s', target: 0 },     // Bajando
  ],
  thresholds: {
    http_req_duration: ['p(90)<4000', 'p(95)<8000'],
    http_req_failed: ['rate<0.15'],
  },
};

export default function () {
  const hasSupabase = !!SUPABASE_ANON_KEY;

  // Carga muy simple: todos ven la misma página + consulta rápida
  group('Spike - página principal', () => {
    visitPage(APP_URL + '/', 'spike_home');
    humanPause();
  });

  group('Spike - ranking', () => {
    visitPage(APP_URL + '/ranking', 'spike_ranking');

    if (hasSupabase) {
      supabaseQuery('users', {
        select: 'id,email,total_points',
        order: 'total_points.desc.nullslast',
        limit: 50,
      }, { type: 'spike_ranking' });
    }
    humanPause();
  });

  group('Spike - partidos', () => {
    visitPage(APP_URL + '/matches', 'spike_matches');

    if (hasSupabase) {
      supabaseQuery('matches', {
        select: '*',
        order: 'match_date.asc',
        limit: 30,
      }, { type: 'spike_matches' });
    }
  });
}
