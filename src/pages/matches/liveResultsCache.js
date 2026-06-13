// Cache en localStorage del último marcador/minuto en vivo conocido (mapa
// { matchId → liveResult }). Permite que al recargar la página se vea el último
// valor al instante, en vez de "---" mientras llega el primer poll de SportScore.

const KEY = 'chessking_live_results';
const TTL_MS = 6 * 60 * 60 * 1000; // 6h: más viejo que esto no tiene sentido mostrar

export function loadLiveCache(nowMs = Date.now()) {
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return {};
    const parsed = JSON.parse(raw);
    if (!parsed || typeof parsed !== 'object') return {};
    if (typeof parsed.savedAt === 'number' && (nowMs - parsed.savedAt) > TTL_MS) return {};
    return parsed.results && typeof parsed.results === 'object' ? parsed.results : {};
  } catch {
    return {};
  }
}

export function saveLiveCache(results, nowMs = Date.now()) {
  try {
    localStorage.setItem(KEY, JSON.stringify({ savedAt: nowMs, results: results || {} }));
  } catch {
    // ignorar (cuota, SSR, etc.)
  }
}
