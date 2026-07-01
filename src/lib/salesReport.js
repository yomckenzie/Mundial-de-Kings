// Helpers para el mini reporte de ventas del dashboard de admin.
// Trabaja sobre los registros de `redemptions` ya cargados.
//
// Formato de cada record (src/lib/db.js:2091):
//   { id, created_date, user_email, prize_id, prize_name,
//     points_spent, status, selected_size? }
//
// status ∈ { 'pending', 'approved', 'delivered', 'rejected' }.

export const PERIODS = [
  { key: '7d',  label: 'Últimos 7 días', days: 7 },
  { key: '30d', label: 'Últimos 30 días', days: 30 },
  { key: '90d', label: 'Últimos 90 días', days: 90 },
  { key: 'all', label: 'Todo el tiempo', days: null },
];

/**
 * Filtra canjes por período y excluye rechazados.
 * Devuelve solo los que cuentan como "venta real" (approved + delivered + pending
 * cuentan, rejected NO — son cancelados).
 */
export function filterActive(redemptions, periodKey) {
  const period = PERIODS.find((p) => p.key === periodKey) || PERIODS[1];
  const cutoff = period.days ? Date.now() - period.days * 86400_000 : 0;
  return redemptions.filter((r) => {
    if (r.status === 'rejected') return false;
    const ts = new Date(r.created_date).getTime();
    return ts >= cutoff;
  });
}

/**
 * Resumen general del período: total canjes, puntos canjeados,
 * usuarios únicos, premios únicos vendidos.
 */
export function getSalesSummary(redemptions, periodKey = '30d') {
  const filtered = filterActive(redemptions, periodKey);
  const uniqueUsers = new Set();
  const uniquePrizes = new Set();
  let totalPoints = 0;
  for (const r of filtered) {
    if (r.user_email) uniqueUsers.add(r.user_email);
    if (r.prize_id) uniquePrizes.add(r.prize_id);
    totalPoints += Number(r.points_spent) || 0;
  }
  return {
    count: filtered.length,
    totalPoints,
    uniqueUsers: uniqueUsers.size,
    uniquePrizes: uniquePrizes.size,
  };
}

/**
 * Top N premios más canjeados en el período.
 * Devuelve [{ prizeId, prizeName, count, points }] ordenado por count desc.
 */
export function getTopPrizes(redemptions, periodKey = '30d', limit = 5) {
  const filtered = filterActive(redemptions, periodKey);
  const map = new Map();
  for (const r of filtered) {
    if (!r.prize_id) continue;
    const prev = map.get(r.prize_id) || {
      prizeId: r.prize_id,
      prizeName: r.prize_name || '(sin nombre)',
      count: 0,
      points: 0,
    };
    prev.count += 1;
    prev.points += Number(r.points_spent) || 0;
    map.set(r.prize_id, prev);
  }
  return Array.from(map.values())
    .sort((a, b) => b.count - a.count || b.points - a.points)
    .slice(0, limit);
}

/**
 * Top N usuarios que más canjean en el período.
 * Devuelve [{ userEmail, count, points }] ordenado por puntos desc.
 */
export function getTopUsers(redemptions, periodKey = '30d', limit = 5) {
  const filtered = filterActive(redemptions, periodKey);
  const map = new Map();
  for (const r of filtered) {
    if (!r.user_email) continue;
    const prev = map.get(r.user_email) || { userEmail: r.user_email, count: 0, points: 0 };
    prev.count += 1;
    prev.points += Number(r.points_spent) || 0;
    map.set(r.user_email, prev);
  }
  return Array.from(map.values())
    .sort((a, b) => b.points - a.points || b.count - a.count)
    .slice(0, limit);
}

/**
 * Distribución de canjes por día en el período.
 * Devuelve [{ date: 'YYYY-MM-DD', count, points }] ordenado ascendente.
 * Útil para mini sparkline/bar chart en el widget.
 */
export function getDailySales(redemptions, periodKey = '30d') {
  const filtered = filterActive(redemptions, periodKey);
  const map = new Map();
  for (const r of filtered) {
    const d = new Date(r.created_date);
    if (Number.isNaN(d.getTime())) continue;
    const key = d.toISOString().slice(0, 10);
    const prev = map.get(key) || { date: key, count: 0, points: 0 };
    prev.count += 1;
    prev.points += Number(r.points_spent) || 0;
    map.set(key, prev);
  }
  return Array.from(map.values()).sort((a, b) => a.date.localeCompare(b.date));
}