// ─── Servicio para sincronizar con API-Football (RapidAPI) ───
import { api } from './client';
import { evaluateMatchPredictions } from './evaluateMatchPredictions';

const RAPIDAPI_HOST = 'api-football-v1.p.rapidapi.com';
const RAPIDAPI_BASE = '/api-football';

// Obtener key de variable de entorno
function getApiKey() {
  return import.meta.env.VITE_RAPIDAPI_KEY || '';
}

let _lastSync = null;
let _connected = false;
let _syncPromise = null;

// ─── Mapa de nombres español → inglés (API-Football) ───
const TEAM_NAME_EN = {
  'méxico': 'Mexico',
  'sudáfrica': 'South Africa',
  'república de corea': 'South Korea',
  'república checa': 'Czech Republic',
  'canadá': 'Canada',
  'bosnia': 'Bosnia',
  'catar': 'Qatar',
  'suiza': 'Switzerland',
  'brasil': 'Brazil',
  'marruecos': 'Morocco',
  'haití': 'Haiti',
  'escocia': 'Scotland',
  'alemania': 'Germany',
  'curazao': 'Curacao',
  'países bajos': 'Netherlands',
  'japón': 'Japan',
  'costa de marfil': 'Ivory Coast',
  'ecuador': 'Ecuador',
  'suecia': 'Sweden',
  'túnez': 'Tunisia',
  'españa': 'Spain',
  'cabo verde': 'Cape Verde',
  'bélgica': 'Belgium',
  'egipto': 'Egypt',
  'arabia saudí': 'Saudi Arabia',
  'uruguay': 'Uruguay',
  'irán': 'Iran',
  'nueva zelanda': 'New Zealand',
  'austria': 'Austria',
  'jordania': 'Jordan',
  'francia': 'France',
  'senegal': 'Senegal',
  'irak': 'Iraq',
  'noruega': 'Norway',
  'argentina': 'Argentina',
  'argelia': 'Algeria',
  'portugal': 'Portugal',
  'rd congo': 'DR Congo',
  'uzbekistán': 'Uzbekistan',
  'colombia': 'Colombia',
  'inglaterra': 'England',
  'croacia': 'Croatia',
  'ghana': 'Ghana',
  'panamá': 'Panama',
  'estados unidos': 'USA',
  'paraguay': 'Paraguay',
  'australia': 'Australia',
  'turquía': 'Turkey',
};

function normalizeName(name) {
  return name.toLowerCase()
    .normalize('NFD').replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9\s]/g, '')
    .trim();
}

function getEnglishName(spanishName) {
  const key = spanishName.toLowerCase().trim();
  return TEAM_NAME_EN[key] || spanishName;
}

function matchTeam(apiTeamName, ourSpanishName) {
  if (!apiTeamName || !ourSpanishName) return false;
  const fn = normalizeName(apiTeamName);
  const en = normalizeName(getEnglishName(ourSpanishName));
  return fn.includes(en) || en.includes(fn) || fn === en;
}

// ─── Verificar si hay API key configurada ───
export function hasApiKey() {
  return getApiKey().length > 0;
}

// ─── Verificar conexión con API-Football ───
export async function checkConnection() {
  const key = getApiKey();
  if (!key) {
    _connected = false;
    return false;
  }
  try {
    const res = await fetch(`${RAPIDAPI_BASE}/v3/status`, {
      headers: {
        'x-rapidapi-key': key,
        'x-rapidapi-host': RAPIDAPI_HOST,
      },
      signal: AbortSignal.timeout(5000),
    });
    if (res.ok) {
      const data = await res.json();
      _connected = data?.response?.requests?.current !== undefined;
      return _connected;
    }
  } catch {}
  _connected = false;
  return false;
}

export function isConnected() {
  return _connected;
}

export function getLastSync() {
  return _lastSync;
}

// ─── Obtener fixtures de API-Football por fecha ───
async function fetchFixtures(dateStr) {
  const key = getApiKey();
  if (!key) throw new Error('No hay API key configurada');

  const res = await fetch(`${RAPIDAPI_BASE}/v3/fixtures?date=${dateStr}`, {
    headers: {
      'x-rapidapi-key': key,
      'x-rapidapi-host': RAPIDAPI_HOST,
    },
    signal: AbortSignal.timeout(10000),
  });

  if (!res.ok) {
    const errText = await res.text().catch(() => '');
    throw new Error(`API error ${res.status}: ${errText.slice(0, 100)}`);
  }

  const data = await res.json();
  return data?.response || [];
}


// ─── Sincronizar con API-Football ───
export async function syncWithApi() {
  if (_syncPromise) return _syncPromise;

  _syncPromise = _doSync();
  try {
    return await _syncPromise;
  } finally {
    _syncPromise = null;
  }
}

async function _doSync() {
  const key = getApiKey();
  if (!key) {
    _lastSync = { time: new Date(), count: 0, error: 'No hay API key' };
    return { synced: 0, error: 'No hay API key' };
  }

  // 1. Obtener partidos locales
  const allMatches = await api.entities.Match.list();
  if (allMatches.length === 0) {
    _lastSync = { time: new Date(), count: 0, message: 'No hay partidos' };
    return { synced: 0 };
  }

  // 2. Solo sincronizar hoy + próximos 5 días + partidos sin finalizar
  const now = new Date();
  const fiveDays = new Date(now.getTime() + 5 * 24 * 60 * 60 * 1000);
  const relevant = allMatches.filter(m => {
    if (!m.match_date) return false;
    const d = new Date(m.match_date + 'T' + (m.match_time || '12:00'));
    return (d >= now && d <= fiveDays) || m.status === 'live' || m.status === 'open' || m.status === 'pending';
  });

  if (relevant.length === 0) {
    _lastSync = { time: new Date(), count: 0, message: 'No hay partidos relevantes' };
    return { synced: 0 };
  }

  // 3. Agrupar por fecha
  const byDate = {};
  for (const m of relevant) {
    if (!m.match_date) continue;
    if (!byDate[m.match_date]) byDate[m.match_date] = [];
    byDate[m.match_date].push(m);
  }

  let totalSynced = 0;
  let totalUpdated = 0;
  const errors = [];

  const dateResults = await Promise.all(
    Object.entries(byDate).map(async ([dateStr, matches]) => {
      try {
        const fixtures = await fetchFixtures(dateStr);
        if (fixtures.length === 0) return { synced: 0, updated: 0, errs: [] };
        let synced = 0;
        let updated = 0;
        const errs = [];
        // Build fixture lookup map for O(1) access (evita fixtures.find() dentro del loop)
        const fixtureMap = new Map();
        for (const f of fixtures) {
          const home = f.teams?.home?.name || '';
          const away = f.teams?.away?.name || '';
          fixtureMap.set(home + '|' + away, f);
          fixtureMap.set(away + '|' + home, f);
        }
        const updResults = await Promise.all(matches.map(async (localMatch) => {
          const key1 = (localMatch.team1 || '') + '|' + (localMatch.team2 || '');
          const key2 = (localMatch.team2 || '') + '|' + (localMatch.team1 || '');
          const fixture = fixtureMap.get(key1) || fixtureMap.get(key2) ||
            fixtures.find(f => {
              const home = f.teams?.home?.name || '';
              const away = f.teams?.away?.name || '';
              return (matchTeam(home, localMatch.team1) && matchTeam(away, localMatch.team2)) ||
                     (matchTeam(home, localMatch.team2) && matchTeam(away, localMatch.team1));
            });
          if (!fixture) return { synced: 0, updated: 0, errs: [] };
          const updates = {};
          const goals = fixture.goals || {};
          const apiStatus = fixture.fixture?.status || {};
          const newHome = goals.home ?? null;
          const newAway = goals.away ?? null;
          if (newHome !== null && newAway !== null &&
              (newHome !== (localMatch.result_team1 ?? -1) || newAway !== (localMatch.result_team2 ?? -1))) {
            updates.result_team1 = newHome;
            updates.result_team2 = newAway;
          }
          const short = apiStatus.short || '';
          if (['FT', 'AET', 'PEN'].includes(short) && localMatch.status !== 'finished') updates.status = 'finished';
          else if (['1H', '2H', 'LIVE', 'ET', 'P', 'BT'].includes(short) && localMatch.status !== 'live') updates.status = 'live';
          else if (short === 'NS' && localMatch.status === 'pending') updates.status = 'open';
          if (fixture.fixture?.id && !localMatch.fixture_id) {
            updates.fixture_id = fixture.fixture.id;
          }
          if (Object.keys(updates).length > 0) {
            try {
              await api.entities.Match.update(localMatch.id, updates);
              // Evaluar pronósticos si el partido acaba de finalizar o el resultado cambió en uno ya finalizado
              const isNowFinished = updates.status === 'finished';
              const resultsChanged = updates.result_team1 != null || updates.result_team2 != null;
              if (isNowFinished || (localMatch.status === 'finished' && resultsChanged)) {
                const r1 = updates.result_team1 ?? localMatch.result_team1;
                const r2 = updates.result_team2 ?? localMatch.result_team2;
                if (r1 != null && r2 != null) {
                  await evaluateMatchPredictions(localMatch.id, r1, r2);
                }
              }
              return { synced: 1, updated: 1, errs: [] };
            } catch (e) {
              return { synced: 0, updated: 0, errs: [`Error actualizando match ${localMatch.fixture_id}: ${e.message}`] };
            }
          }
          return { synced: 1, updated: 0, errs: [] };
        }));
        for (const r of updResults) {
          synced += r.synced;
          updated += r.updated;
          if (r.errs.length) errs.push(...r.errs);
        }
        return { synced, updated, errs };
      } catch (e) {
        return { synced: 0, updated: 0, errs: [`Error en fecha ${dateStr}: ${e.message}`] };
      }
    })
  );

  for (const r of dateResults) {
    totalSynced += r.synced;
    totalUpdated += r.updated;
    errors.push(...r.errs);
  }

  _connected = true;
  _lastSync = {
    time: new Date(),
    count: totalSynced,
    updated: totalUpdated,
    message: `${totalSynced} sincronizados, ${totalUpdated} actualizados`,
    errors: errors.length > 0 ? errors : undefined,
  };

  return { synced: totalSynced, updated: totalUpdated, errors };
}

// ─── Obtener partidos en vivo ───
export async function fetchLiveMatches() {
  const key = getApiKey();
  if (!key) return [];

  try {
    const res = await fetch(`${RAPIDAPI_BASE}/v3/fixtures?live=all`, {
      headers: {
        'x-rapidapi-key': key,
        'x-rapidapi-host': RAPIDAPI_HOST,
      },
      signal: AbortSignal.timeout(8000),
    });
    if (!res.ok) return [];
    const data = await res.json();
    _connected = true;
    return data?.response || [];
  } catch {
    _connected = false;
    return [];
  }
}

export { TEAM_NAME_EN, getEnglishName };

export default {
  syncWithApi,
  checkConnection,
  isConnected,
  getLastSync,
  fetchLiveMatches,
  hasApiKey,
};
