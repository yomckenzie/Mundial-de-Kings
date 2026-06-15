import { clsx } from "clsx"
import { twMerge } from "tailwind-merge"

export function cn(...inputs) {
  return twMerge(clsx(inputs))
}

/**
 * Convierte una hora en formato 24h ("HH:MM" o "HH:MM:SS") a 12h con AM/PM.
 * Si el input es vacío, inválido o ya no incluye dos puntos, lo devuelve tal cual.
 * @param {string} time24
 * @returns {string}
 */
export function formatTime12h(time24) {
  if (!time24 || typeof time24 !== 'string' || !time24.includes(':')) return time24 || '';
  const parts = time24.split(':');
  const h = Number(parts[0]);
  const m = Number(parts[1]);
  if (!Number.isFinite(h) || !Number.isFinite(m)) return time24;
  const period = h >= 12 ? 'PM' : 'AM';
  const hour12 = ((h + 11) % 12) + 1; // 0→12, 13→1
  return `${hour12}:${String(m).padStart(2, '0')} ${period}`;
}

/**
 * Normaliza un documento de identidad (cédula o pasaporte) para comparar:
 * quita espacios y guiones, recorta y pasa a minúsculas. Así "8-123-456",
 * "8123456" y "8 123 456" se consideran iguales. Lo usan tanto el registro
 * (anti-duplicados) como la verificación al canjear premios.
 * @param {string} v
 * @returns {string}
 */
export function normalizeDoc(v) {
  return (v || '').replace(/[\s-]/g, '').trim().toLowerCase();
}

/**
 * Sanea un destino de redirección leído de la URL.
 * Solo acepta rutas internas relativas ("/algo"). Rechaza URLs absolutas
 * (https://...), protocol-relative (//evil.com), javascript:, y backslashes
 * (\/ que algunos navegadores normalizan a //).
 */
export function sanitizeRedirect(value) {
  if (typeof value !== 'string' || !value.startsWith('/')) return '/';
  if (value.startsWith('//') || value.includes('\\')) return '/';
  return value;
}
