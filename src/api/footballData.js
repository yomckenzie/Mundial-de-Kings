// ─── Servicio football-data.org (GRATIS) ───
// Plan Free: 10 requests/minuto
// Registro: https://www.football-data.org/ (sin tarjeta de crédito)
// Endpoints v4 con X-Auth-Token

import { api } from './client';
import { TEAM_NAME_EN } from './footballSync';

const FD_BASE = '/api/football-data/v4';
const FD_HOST = 'api.football-data.org';

function getKey() {
  return import.meta.env.VITE_FOOTBALL_DATA_KEY || '';
}

let _lastCheck = null;
let _connected = false;

// ─── Competitions cache ───
let _competitionsCache = null;

export function hasKey() {
  return getKey().length > 0;
}

export function isConnected() {
  return _connected;
}

export function getLastCheck() {
  return _lastCheck;
}

// ─── Verificar conexión ───
export async function checkConnection() {
  const key = getKey();
  if (!key) {
    _connected = false;
    _lastCheck = { time: new Date(), error: 'No hay API key' };
    return false;
  }
  try {
    const res = await fetch(`${FD_BASE}/competitions`, {
      headers: { 'X-Auth-Token': key },
      signal: AbortSignal.timeout(5000),
    });
    if (res.ok) {
      const data = await res.json();
      _connected = true;
      _lastCheck = { time: new Date(), ok: true };
      // Cachear competencias disponibles
      _competitionsCache = data?.competitions || [];
      return true;
    }
    _connected = false;
    _lastCheck = { time: new Date(), error: `HTTP ${res.status}` };
    return false;
  } catch (e) {
    _connected = false;
    _lastCheck = { time: new Date(), error: e.message };
    return false;
  }
}

// ─── Obtener lista de competencias disponibles ───
export async function getCompetitions() {
  if (_competitionsCache) return _competitionsCache;
  const key = getKey();
  if (!key) return [];
  try {
    const res = await fetch(`${FD_BASE}/competitions`, {
      headers: { 'X-Auth-Token': key },
      signal: AbortSignal.timeout(5000),
    });
    if (res.ok) {
      const data = await res.json();
      _competitionsCache = data?.competitions || [];
      return _competitionsCache;
    }
    return [];
  } catch {
    return [];
  }
}

// ─── Obtener matches por fecha ───
export async function fetchMatchesByDate(dateStr) {
  const key = getKey();
  if (!key) return [];

  try {
    const res = await fetch(`${FD_BASE}/matches?date=${dateStr}`, {
      headers: { 'X-Auth-Token': key },
      signal: AbortSignal.timeout(8000),
    });
    if (!res.ok) return [];
    const data = await res.json();
    return data?.matches || [];
  } catch {
    return [];
  }
}

// ─── Obtener matches de una competencia específica ───
export async function fetchCompetitionMatches(competitionId, dateFrom, dateTo) {
  const key = getKey();
  if (!key) return [];

  let url = `${FD_BASE}/competitions/${competitionId}/matches`;
  const params = [];
  if (dateFrom) params.push(`dateFrom=${dateFrom}`);
  if (dateTo) params.push(`dateTo=${dateTo}`);
  if (params.length) url += '?' + params.join('&');

  try {
    const res = await fetch(url, {
      headers: { 'X-Auth-Token': key },
      signal: AbortSignal.timeout(8000),
    });
    if (!res.ok) return [];
    const data = await res.json();
    return data?.matches || [];
  } catch {
    return [];
  }
}

// ─── Obtener matches en vivo ───
export async function fetchLiveMatches() {
  const key = getKey();
  if (!key) return [];

  try {
    const res = await fetch(`${FD_BASE}/matches?status=LIVE`, {
      headers: { 'X-Auth-Token': key },
      signal: AbortSignal.timeout(8000),
    });
    if (!res.ok) return [];
    const data = await res.json();
    return data?.matches || [];
  } catch {
    return [];
  }
}

// ─── Buscar Mundial 2026 en competencias ───
export async function findWorldCupCompetition() {
  const comps = await getCompetitions();
  return comps.find(c =>
    c.name?.toLowerCase().includes('world cup') ||
    c.name?.toLowerCase().includes('worldcup') ||
    (c.code === 'WC' || c.code === 'FIFA')
  ) || null;
}

// ─── Sincronizar resultados con nuestra DB ───
export async function syncResults() {
  const key = getKey();
  if (!key) return { synced: 0, updated: 0, error: 'No hay API key' };

  const allMatches = await api.entities.Match.list();
  if (allMatches.length === 0) return { synced: 0, message: 'No hay partidos' };

  // O(1) lookup map by fixture_id and by team-pair key
  const localByFixture = new Map();
  const localByTeams = new Map();
  for (const m of allMatches) {
    if (m.fixture_id != null) localByFixture.set(m.fixture_id, m);
    if (m.team1 && m.team2) localByTeams.set(`${m.team1}|${m.team2}`, m);
  }
  const findLocalMatch = (fdId, homeTeam, awayTeam) =>
    localByFixture.get(fdId) || localByTeams.get(`${homeTeam}|${awayTeam}`);

  // Partidos hoy, ayer y anteayer (para resultados recientes)
  const dates = [];
  for (let i = -1; i <= 0; i++) {
    const d = new Date();
    d.setDate(d.getDate() + i);
    dates.push(d.toISOString().slice(0, 10));
  }

  let totalSynced = 0;
  let totalUpdated = 0;
  const errors = [];

  const dateResults = await Promise.all(
    dates.map(async (dateStr) => {
      try {
        const matches = await fetchMatchesByDate(dateStr);
        if (!matches.length) return { totalSynced: 0, totalUpdated: 0, errors: [] };
        let synced = 0;
        let updated = 0;
        const errs = [];
        const updResults = await Promise.all(matches.map(async (fdMatch) => {
          const homeTeam = fdMatch.homeTeam?.name || '';
          const awayTeam = fdMatch.awayTeam?.name || '';
          if (!homeTeam || !awayTeam) return { synced: 0, updated: 0, errs: [] };

          const localMatch = findLocalMatch(fdMatch.id, homeTeam, awayTeam);
          if (!localMatch) return { synced: 1, updated: 0, errs: [] };

          const scoreHome = fdMatch.score?.fullTime?.home;
          const scoreAway = fdMatch.score?.fullTime?.away;
          const status = fdMatch.status || '';
          const isFinished = status === 'FINISHED';
          const isLive = ['LIVE', 'IN_PLAY', 'PAUSED'].includes(status);
          const isScheduled = status === 'SCHEDULED' || status === 'TIMED';

          const updates = {};

          if (scoreHome !== null && scoreHome !== undefined && scoreAway !== null && scoreAway !== undefined) {
            const newHome = Number(scoreHome);
            const newAway = Number(scoreAway);
            if (newHome !== (localMatch.result_team1 ?? -1) || newAway !== (localMatch.result_team2 ?? -1)) {
              updates.result_team1 = newHome;
              updates.result_team2 = newAway;
            }
          }

          if (isFinished && localMatch.status !== 'finished') updates.status = 'finished';
          else if (isLive && localMatch.status !== 'live') updates.status = 'live';
          else if (isScheduled && localMatch.status === 'open') updates.status = 'open';

          if (fdMatch.id && !localMatch.fd_id) {
            updates.fd_id = fdMatch.id;
          }

          if (Object.keys(updates).length > 0) {
            try {
              await api.entities.Match.update(localMatch.id, updates);
              return { synced: 1, updated: 1, errs: [] };
            } catch (e) {
              return { synced: 0, updated: 0, errs: [`Error actualizando match ${localMatch.fixture_id || localMatch.id}: ${e.message}`] };
            }
          }
          return { synced: 1, updated: 0, errs: [] };
        }));
        for (const r of updResults) {
          synced += r.synced;
          updated += r.updated;
          if (r.errs.length) errs.push(...r.errs);
        }
        return { totalSynced: synced, totalUpdated: updated, errors: errs };
      } catch (e) {
        return { totalSynced: 0, totalUpdated: 0, errors: [`Error en fecha ${dateStr}: ${e.message}`] };
      }
    })
  );

  for (const r of dateResults) {
    totalSynced += r.totalSynced;
    totalUpdated += r.totalUpdated;
    errors.push(...r.errors);
  }

  _connected = true;
  _lastCheck = {
    time: new Date(),
    synced: totalSynced,
    updated: totalUpdated,
    message: `${totalSynced} revisados, ${totalUpdated} actualizados`,
    errors: errors.length > 0 ? errors : undefined,
  };

  return { synced: totalSynced, updated: totalUpdated, errors };
}

// ─── Matching de equipos con normalización (usa TEAM_NAME_EN de footballSync) ───
function normalize(name) {
  return name.toLowerCase()
    .normalize('NFD').replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9\s]/g, '')
    .trim();
}

function getEnglishName(spanishName) {
  const key = spanishName.toLowerCase().trim();
  return TEAM_NAME_EN[key] || spanishName;
}

function matchTeams(apiHome, apiAway, ourHome, ourAway) {
  const ah = normalize(apiHome);
  const aa = normalize(apiAway);
  // Traducir nombres locales al inglés antes de comparar
  const oh = normalize(getEnglishName(ourHome));
  const oa = normalize(getEnglishName(ourAway));

  // Match exacto
  if ((ah === oh && aa === oa) || (ah === oa && aa === oh)) return true;

  // Match por inclusión
  return (
    (ah.includes(oh) || oh.includes(ah)) &&
    (aa.includes(oa) || oa.includes(aa))
  ) || (
    (ah.includes(oa) || oa.includes(ah)) &&
    (aa.includes(oh) || oh.includes(aa))
  );
}

export default {
  checkConnection,
  isConnected,
  getLastCheck,
  getCompetitions,
  findWorldCupCompetition,
  fetchMatchesByDate,
  fetchLiveMatches,
  syncResults,
  hasKey,
};
