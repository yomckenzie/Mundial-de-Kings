// ═══════════════════════════════════════════════════════════
// 🛠️  Helpers compartidos para tests k6
// ═══════════════════════════════════════════════════════════

import { check, sleep, group } from 'k6';
import http from 'k6/http';
import { SUPABASE_URL, SUPABASE_ANON_KEY, SUPABASE_HEADERS } from './env.js';

// Verificar al inicio si la anon key está configurada
(function validateEnv() {
  if (!SUPABASE_ANON_KEY) {
    // En k6 esto se ejecuta en el init context (antes de VU)
    console.warn('⚠️  SUPABASE_ANON_KEY no configurada — las consultas a Supabase se saltarán');
    console.warn('   Pasa la key: k6 run -e SUPABASE_ANON_KEY="eyJ..." k6-tests/<script>.js');
  }
})();

/**
 * Simula la navegación a una página de la app SPA.
 * Las SPAs cargan todo el JS en la primera visita,
 * así que medimos la respuesta del servidor de estáticos.
 */
export function visitPage(url, name) {
  const res = http.get(url, { tags: { name: `page_${name}` } });
  check(res, {
    [`${name} - status 200`]: (r) => r.status === 200,
    [`${name} - carga < 3s`]: (r) => r.timings.duration < 3000,
  });
  return res;
}

/**
 * Consulta una tabla de Supabase vía REST API.
 */
export function supabaseQuery(table, params = {}, tags = {}) {
  const queryString = Object.entries(params)
    .map(([k, v]) => `${encodeURIComponent(k)}=${encodeURIComponent(v)}`)
    .join('&');

  const url = `${SUPABASE_URL}/rest/v1/${table}${queryString ? '?' + queryString : ''}`;
  const res = http.get(url, {
    headers: SUPABASE_HEADERS,
    tags: { name: `supabase_${table}`, ...tags },
  });

  check(res, {
    [`${table} - consulta exitosa`]: (r) => r.status === 200,
    [`${table} - respuesta rápida < 1s`]: (r) => r.timings.duration < 1000,
  });

  return res;
}

/**
 * Inserta un registro en Supabase.
 */
export function supabaseInsert(table, data, tags = {}) {
  const url = `${SUPABASE_URL}/rest/v1/${table}`;
  const res = http.post(url, JSON.stringify(data), {
    headers: { ...SUPABASE_HEADERS, Prefer: 'return=representation' },
    tags: { name: `supabase_insert_${table}`, ...tags },
  });

  check(res, {
    [`${table} - inserción exitosa`]: (r) => r.status === 201,
    [`${table} - inserción rápida < 2s`]: (r) => r.timings.duration < 2000,
  });

  return res;
}

/**
 * Inicia sesión con Supabase Auth (email+password).
 * Retorna el access_token si es exitoso.
 */
export function supabaseLogin(email, password) {
  const url = `${SUPABASE_URL}/auth/v1/token?grant_type=password`;
  const res = http.post(url, JSON.stringify({ email, password }), {
    headers: SUPABASE_HEADERS,
    tags: { name: 'auth_login' },
  });

  const success = check(res, {
    'login - status 200': (r) => r.status === 200,
    'login - tiene access_token': (r) => {
      try {
        const body = JSON.parse(r.body);
        return body.access_token && body.access_token.length > 0;
      } catch {
        return false;
      }
    },
  });

  if (success) {
    try {
      const body = JSON.parse(res.body);
      return body.access_token;
    } catch {
      return null;
    }
  }
  return null;
}

/**
 * Crea headers de autorización para peticiones autenticadas.
 */
export function authHeaders(token) {
  return {
    ...SUPABASE_HEADERS,
    'Authorization': `Bearer ${token}`,
  };
}

/**
 * Pausa entre acciones para simular comportamiento humano realista.
 */
export function humanPause() {
  sleep(Math.random() * 2 + 0.5); // 0.5s a 2.5s
}

/**
 * Genera un email único para registros de prueba.
 */
export function uniqueEmail(prefix = 'test') {
  const ts = Date.now();
  const rand = Math.random().toString(36).slice(2, 6);
  return `${prefix}_${ts}_${rand}@chessking.test`;
}
