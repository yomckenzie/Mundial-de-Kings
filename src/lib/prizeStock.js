/**
 * Helpers para calcular el estado de stock de un premio.
 *
 * Estados:
 *   - 'out'    : agotado (0 unidades disponibles)
 *   - 'low'    : por acabarse (≤ 20% del original o ≤ 3 unidades)
 *   - 'ok'     : stock saludable
 *
 * Se exporta `getStockStatus(prize)` que devuelve uno de esos strings +
 * datos útiles (disponible, original, porcentaje).
 *
 * Funciona con premios CON o SIN tallas:
 *   - CON tallas: stock = suma de sizes; original = suma de original_sizes
 *     (o si no hay original_sizes, cae a original_stock)
 *   - SIN tallas: stock = units_available; original = original_stock
 */
export function getStockStatus(prize) {
  if (!prize) return { status: 'ok', available: 0, original: 0, percent: 100 };

  // Stock disponible (ya viene calculado por la API)
  const available = Number(prize.units_available) || 0;

  // Stock original (base)
  let original;
  if (prize.original_sizes && typeof prize.original_sizes === 'object') {
    original = Object.values(prize.original_sizes).reduce(
      (sum, s) => sum + (Number(s) || 0), 0
    );
  } else if (prize.sizes && typeof prize.sizes === 'object'
             && Object.keys(prize.sizes).length > 0) {
    // Fallback: usar sizes (computed por la API)
    original = Object.values(prize.sizes).reduce(
      (sum, s) => sum + (Number(s) || 0), 0
    ) + available; // porque sizes ya está restado
  } else {
    original = Number(prize.original_stock) || 0;
  }

  if (original <= 0) {
    return { status: 'ok', available, original: 0, percent: 100 };
  }
  const percent = Math.max(0, Math.min(100, Math.round((available / original) * 100)));

  let status;
  if (available <= 0) {
    status = 'out';
  } else if (available <= 3 || percent <= 20) {
    status = 'low';
  } else {
    status = 'ok';
  }

  return { status, available, original, percent };
}

/**
 * Devuelve los N premios más críticos ordenados por:
 *   1. agotados primero
 *   2. luego por menor % de stock disponible
 */
export function getCriticalPrizes(prizes, limit = 5) {
  if (!Array.isArray(prizes)) return [];
  return prizes
    .map((p) => ({ prize: p, stock: getStockStatus(p) }))
    .filter((x) => x.stock.status === 'out' || x.stock.status === 'low')
    .sort((a, b) => {
      // agotados primero
      if (a.stock.status === 'out' && b.stock.status !== 'out') return -1;
      if (a.stock.status !== 'out' && b.stock.status === 'out') return 1;
      // luego por menor % (más urgente primero)
      return a.stock.percent - b.stock.percent;
    })
    .slice(0, limit);
}

/**
 * Resumen agregado: cuenta premios por estado.
 */
export function getStockSummary(prizes) {
  const summary = { out: 0, low: 0, ok: 0, total: 0 };
  if (!Array.isArray(prizes)) return summary;
  for (const p of prizes) {
    const s = getStockStatus(p);
    summary[s.status]++;
    summary.total++;
  }
  return summary;
}