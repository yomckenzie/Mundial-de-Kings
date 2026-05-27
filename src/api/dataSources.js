// ─── Sistema Unificado de Fuentes de Datos ───
// Detecta automáticamente qué fuentes están disponibles y usa la mejor.
//
// Prioridad:
//   1. API-Football (RapidAPI, PAGA ~$19/mes) - Live scores + resultados
//   2. football-data.org (GRATIS, 10 req/min) - Resultados post-partido
//   3. Manual (SIEMPRE disponible) - Admin ingresa resultados
//
// El sistema intenta usar la fuente de mayor prioridad primero.
// Si falla, hace fallback automático a la siguiente.

// ─── Importar fuentes dinámicamente ───
let _sources = null;
let _sourceStatus = {};

const SOURCES = [
  { id: 'api-football', name: 'API-Football', type: 'pago', priority: 1, desc: 'Live scores ($19/mes)' },
  { id: 'football-data', name: 'football-data.org', type: 'gratis', priority: 2, desc: 'Resultados automáticos' },
  { id: 'manual', name: 'Manual', type: 'siempre', priority: 3, desc: 'Admin ingresa resultados' },
];

async function getSources() {
  if (_sources) return _sources;

  const available = [];
  let bestId = 'manual';

  // Source 1: API-Football (RapidAPI)
  try {
    const { hasApiKey, checkConnection } = await import('./footballSync');
    const hasKey = hasApiKey();
    if (hasKey) {
      const online = await checkConnection();
      available.push({ id: 'api-football', name: 'API-Football', type: 'pago', online, keyConfigured: true });
      if (online) bestId = 'api-football';
    } else {
      available.push({ id: 'api-football', name: 'API-Football', type: 'pago', online: false, keyConfigured: false });
    }
  } catch {
    available.push({ id: 'api-football', name: 'API-Football', type: 'pago', online: false, keyConfigured: false });
  }

  // Source 2: football-data.org
  try {
    const fd = await import('./footballData');
    const hasKey = fd.hasKey();
    if (hasKey) {
      const online = await fd.checkConnection();
      available.push({ id: 'football-data', name: 'football-data.org', type: 'gratis', online, keyConfigured: true });
      if (online && bestId === 'manual') bestId = 'football-data';
    } else {
      available.push({ id: 'football-data', name: 'football-data.org', type: 'gratis', online: false, keyConfigured: false });
    }
  } catch {
    available.push({ id: 'football-data', name: 'football-data.org', type: 'gratis', online: false, keyConfigured: false });
  }

  // Source 3: Manual (siempre disponible)
  available.push({ id: 'manual', name: 'Manual', type: 'siempre', online: true, keyConfigured: true });

  _sources = available;
  _sourceStatus = { bestSource: bestId, sources: available };

  return available;
}

// ─── Obtener estado de todas las fuentes ───
export async function getSourceStatus() {
  _sources = null; // Refresh cada vez
  await getSources();
  
  const best = SOURCES.find(s => s.id === _sourceStatus.bestSource);
  const status = {
    bestSource: _sourceStatus.bestSource,
    bestSourceName: best?.name || 'Manual',
    bestSourceType: best?.type || 'siempre',
    sources: _sourceStatus.sources,
    hasAutoSync: _sourceStatus.bestSource !== 'manual',
  };

  // Añadir info de última sincronización
  try {
    if (status.bestSource === 'api-football') {
      const fs = await import('./footballSync');
      const lastSync = fs.getLastSync();
      status.lastSync = lastSync;
      status.connected = fs.isConnected();
    } else if (status.bestSource === 'football-data') {
      const fd = await import('./footballData');
      status.lastSync = fd.getLastCheck();
      status.connected = fd.isConnected();
    }
  } catch {}

  return status;
}

// ─── Sincronizar usando la mejor fuente disponible ───
export async function syncWithBestSource() {
  const sources = await getSources();
  const errors = [];

  // Intentar API-Football primero
  const apiFootball = sources.find(s => s.id === 'api-football');
  if (apiFootball?.keyConfigured) {
    try {
      const fs = await import('./footballSync');
      if (await fs.checkConnection()) {
        const result = await fs.syncWithApi();
        if (result.synced > 0 || result.updated > 0) {
          return { ...result, source: 'api-football' };
        }
      }
    } catch (e) {
      errors.push({ source: 'api-football', error: e.message });
    }
  }

  // Fallback a football-data.org
  const footballData = sources.find(s => s.id === 'football-data');
  if (footballData?.keyConfigured) {
    try {
      const fd = await import('./footballData');
      if (await fd.checkConnection()) {
        const result = await fd.syncResults();
        if (result.synced > 0 || result.updated > 0) {
          return { ...result, source: 'football-data' };
        }
      }
    } catch (e) {
      errors.push({ source: 'football-data', error: e.message });
    }
  }

  // Si todo falló, retornar manual
  return {
    synced: 0,
    updated: 0,
    source: 'manual',
    message: 'Sin fuente automática disponible. Usa el panel Admin para ingresar resultados manualmente.',
    errors: errors.length > 0 ? errors : undefined,
  };
}

// ─── Verificar salud de las fuentes ───
export async function checkAllSources() {
  const results = [];

  // API-Football
  try {
    const { hasApiKey, checkConnection, isConnected } = await import('./footballSync');
    const hasKey = hasApiKey();
    let online = false;
    if (hasKey) online = await checkConnection();
    results.push({
      id: 'api-football',
      name: 'API-Football',
      configured: hasKey,
      online,
      type: 'pago',
      desc: 'Live scores y resultados en tiempo real',
      setup: 'VITE_RAPIDAPI_KEY en .env',
    });
  } catch {
    results.push({ id: 'api-football', name: 'API-Football', configured: false, online: false, type: 'pago' });
  }

  // football-data.org
  try {
    const fd = await import('./footballData');
    const hasKey = fd.hasKey();
    let online = false;
    if (hasKey) online = await fd.checkConnection();
    results.push({
      id: 'football-data',
      name: 'football-data.org',
      configured: hasKey,
      online,
      type: 'gratis',
      desc: 'Resultados automáticos (10 req/min)',
      setup: 'VITE_FOOTBALL_DATA_KEY en .env — regístrate gratis en football-data.org',
    });
  } catch {
    results.push({ id: 'football-data', name: 'football-data.org', configured: false, online: false, type: 'gratis' });
  }

  // Manual
  results.push({
    id: 'manual',
    name: 'Manual',
    configured: true,
    online: true,
    type: 'siempre',
    desc: 'Admin ingresa resultados desde el panel',
    setup: 'Siempre disponible',
  });

  return results;
}

// ─── Obtener partidos en vivo (de cualquier fuente disponible) ───
export async function getLiveMatches() {
  try {
    const { hasApiKey, checkConnection, fetchLiveMatches } = await import('./footballSync');
    if (hasApiKey() && await checkConnection()) {
      return await fetchLiveMatches();
    }
  } catch {}

  try {
    const fd = await import('./footballData');
    if (fd.hasKey() && await fd.checkConnection()) {
      return await fd.fetchLiveMatches();
    }
  } catch {}

  return [];
}

// ─── Refrescar status (resetear caché) ───
export function refreshStatus() {
  _sources = null;
  _sourceStatus = {};
}

export default {
  getSourceStatus,
  syncWithBestSource,
  checkAllSources,
  getLiveMatches,
  refreshStatus,
};
