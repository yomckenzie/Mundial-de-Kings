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

  for (const dateStr of dates) {
    try {
      const matches = await fetchMatchesByDate(dateStr);
      if (!matches.length) continue;

      for (const fdMatch of matches) {
        const homeTeam = fdMatch.homeTeam?.name || '';
        const awayTeam = fdMatch.awayTeam?.name || '';
        if (!homeTeam || !awayTeam) continue;

        // Buscar match local por nombre de equipo
        const localMatch = allMatches.find(m =>
          matchTeams(homeTeam, awayTeam, m.team1, m.team2)
        );

        if (!localMatch) continue;
        totalSynced++;

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
          if (newHome !== localMatch.result_team1) updates.result_team1 = newHome;
          if (newAway !== localMatch.result_team2) updates.result_team2 = newAway;
        }

        if (isFinished && localMatch.status !== 'finished') {
          updates.status = 'finished';
        } else if (isLive && localMatch.status !== 'live') {
          updates.status = 'live';
        } else if (isScheduled && localMatch.status === 'pending') {
          updates.status = 'open';
        }

        if (fdMatch.id && !localMatch.fd_id) {
          updates.fd_id = fdMatch.id;
        }

        if (Object.keys(updates).length > 0) {
          try {
            await api.entities.Match.update(localMatch.id, updates);
            totalUpdated++;
          } catch (e) {
            errors.push(`Error actualizando match ${localMatch.fixture_id || localMatch.id}: ${e.message}`);
          }
        }
      }
    } catch (e) {
      errors.push(`Error en fecha ${dateStr}: ${e.message}`);
    }
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
