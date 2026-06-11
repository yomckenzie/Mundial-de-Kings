// ═══════════════════════════════════════════════════════════
// Configuración de entorno para tests k6 — Chess King App
// ═══════════════════════════════════════════════════════════
// Pasa las variables con -e al invocar k6:
//   k6 run -e SUPABASE_ANON_KEY='eyJ...' -e ADMIN_EMAIL='...' -e ADMIN_PASSWORD='...' <test>
// ═══════════════════════════════════════════════════════════

// URL pública del proyecto Supabase (segura para trackear en git)
export const SUPABASE_URL = __ENV.SUPABASE_URL || 'https://khrxddafhzvfdyivysay.supabase.co';

// Anon key — requerida para consultas a Supabase
export const SUPABASE_ANON_KEY = __ENV.SUPABASE_ANON_KEY || '';

// URL de la app
export const APP_URL = __ENV.APP_URL || 'http://localhost:5173';

// Headers estándar para peticiones a Supabase REST/Auth
export const SUPABASE_HEADERS = {
  'Content-Type': 'application/json',
  'apikey': SUPABASE_ANON_KEY,
  'Authorization': `Bearer ${SUPABASE_ANON_KEY}`,
};

// Umbrales por defecto compartidos entre tests
export const THRESHOLDS = {
  http_req_duration: ['p(95)<2000', 'p(99)<5000'],
  http_req_failed: ['rate<0.05'],
};

// Credenciales admin — sin fallback; se deben pasar como variables de entorno.
// Los tests con escenario admin llaman requireAdminCreds() antes de usarlas.
export const ADMIN_EMAIL = __ENV.ADMIN_EMAIL || '';
export const ADMIN_PASSWORD = __ENV.ADMIN_PASSWORD || '';

/**
 * Verifica que las credenciales de admin estén definidas.
 * Lanza un Error si faltan, abortando el test con un mensaje claro.
 * Llama esta función al inicio de cualquier escenario que necesite login admin.
 */
export function requireAdminCreds() {
  if (!ADMIN_EMAIL || !ADMIN_PASSWORD) {
    throw new Error(
      'Faltan ADMIN_EMAIL / ADMIN_PASSWORD. Ejecuta: ' +
      'k6 run -e ADMIN_EMAIL=... -e ADMIN_PASSWORD=... <test>'
    );
  }
}
