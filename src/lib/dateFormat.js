/**
 * Formateo de fechas en español usando Intl API nativa.
 * Reemplaza date-fns/locale/es para evitar TDZ en bundle de producción.
 */

const MONTHS = [
  'enero', 'febrero', 'marzo', 'abril', 'mayo', 'junio',
  'julio', 'agosto', 'septiembre', 'octubre', 'noviembre', 'diciembre',
];

const MONTHS_SHORT = [
  'ene.', 'feb.', 'mar.', 'abr.', 'may.', 'jun.',
  'jul.', 'ago.', 'sep.', 'oct.', 'nov.', 'dic.',
];

/**
 * "15 de junio de 2026"
 */
export function formatDateLong(date) {
  const d = date instanceof Date ? date : new Date(date);
  if (isNaN(d.getTime())) return '';
  return `${d.getDate()} de ${MONTHS[d.getMonth()]} de ${d.getFullYear()}`;
}

/**
 * "15 de junio"
 */
export function formatDateMedium(date) {
  const d = date instanceof Date ? date : new Date(date);
  if (isNaN(d.getTime())) return '';
  return `${d.getDate()} de ${MONTHS[d.getMonth()]}`;
}

/**
 * "15 jun. 2026, 14:30"
 */
export function formatDateShort(date) {
  const d = date instanceof Date ? date : new Date(date);
  if (isNaN(d.getTime())) return '';
  const day = String(d.getDate()).padStart(2, '0');
  const month = MONTHS_SHORT[d.getMonth()];
  const year = d.getFullYear();
  const hours = String(d.getHours()).padStart(2, '0');
  const minutes = String(d.getMinutes()).padStart(2, '0');
  return `${day} ${month} ${year}, ${hours}:${minutes}`;
}

/**
 * "15/06" (dd/MM)
 */
export function formatDayMonth(date) {
  const d = date instanceof Date ? date : new Date(date);
  if (isNaN(d.getTime())) return '';
  const day = String(d.getDate()).padStart(2, '0');
  const month = String(d.getMonth() + 1).padStart(2, '0');
  return `${day}/${month}`;
}

/**
 * "hace 5 minutos", "hace 2 horas", "hace 3 días"
 */
const rtf = new Intl.RelativeTimeFormat('es-ES', { numeric: 'auto' });

export function timeAgo(date) {
  const d = date instanceof Date ? date : new Date(date);
  if (isNaN(d.getTime())) return '';
  const now = new Date();
  const diffMs = now - d;
  const diffSec = Math.floor(diffMs / 1000);
  const diffMin = Math.floor(diffSec / 60);
  const diffHour = Math.floor(diffMin / 60);
  const diffDay = Math.floor(diffHour / 24);
  const diffWeek = Math.floor(diffDay / 7);
  const diffMonth = Math.floor(diffDay / 30);
  const diffYear = Math.floor(diffDay / 365);

  if (diffSec < 60) return rtf.format(-Math.max(1, diffSec), 'second');
  if (diffMin < 60) return rtf.format(-diffMin, 'minute');
  if (diffHour < 24) return rtf.format(-diffHour, 'hour');
  if (diffDay < 7) return rtf.format(-diffDay, 'day');
  if (diffWeek < 5) return rtf.format(-diffWeek, 'week');
  if (diffMonth < 12) return rtf.format(-diffMonth, 'month');
  return rtf.format(-diffYear, 'year');
}

/**
 * Formatea una fecha para el ranking: "15 de junio de 2026"
 * Acepta string ISO o Date
 */
export function formatRankingDate(dateStr) {
  if (!dateStr) return formatDateLong(new Date());
  // Si es solo fecha sin hora, agregar T12:00:00 para evitar problemas de zona horaria
  const d = dateStr.includes('T') ? new Date(dateStr) : new Date(dateStr + 'T12:00:00');
  return formatDateLong(d);
}
