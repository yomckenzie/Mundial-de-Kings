// ─── Servicio para sincronizar con API-Football (RapidAPI) ───
import { api } from './client';

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

// ─── Interpretar estado del fixture ───
function parseStatus(apiStatus) {
  if (!apiStatus) return 'pending';
  const short = apiStatus.short || '';
  // Estados de API-Football:
  // TBD (por definir), NS (no iniciado), 1H, HT, 2H, ET, BT, P, INT (tiempo extra, etc.)
  // FT (finalizado), AET (final extra), PEN (penales), CANC (cancelado)
  if (['FT', 'AET', 'PEN'].includes(short)) return 'finished';
  if (['1H', '2H', 'ET', 'BT', 'P', 'HT', 'INT'].includes(short)) return 'live';
  if (['CANC', 'ABD', 'POST'].includes(short)) return 'closed';
  return 'pending';
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

  for (const [dateStr, matches] of Object.entries(byDate)) {
    try {
      const fixtures = await fetchFixtures(dateStr);
      if (fixtures.length === 0) continue;

      for (const localMatch of matches) {
        // Buscar fixture por equipos
        const fixture = fixtures.find(f => {
          const home = f.teams?.home?.name || '';
          const away = f.teams?.away?.name || '';
          return (
            (matchTeam(home, localMatch.team1) && matchTeam(away, localMatch.team2)) ||
            (matchTeam(home, localMatch.team2) && matchTeam(away, localMatch.team1))
          );
        });

        if (!fixture) continue;
        totalSynced++;

        const updates = {};
        const goals = fixture.goals || {};
        const apiStatus = fixture.fixture?.status || {};

        // Resultados
        if (goals.home !== null && goals.home !== undefined) {
          const newScore = Number(goals.home);
          if (newScore !== localMatch.result_team1) updates.result_team1 = newScore;
        }
        if (goals.away !== null && goals.away !== undefined) {
          const newScore = Number(goals.away);
          if (newScore !== localMatch.result_team2) updates.result_team2 = newScore;
        }

        // Estado
        const newStatus = parseStatus(apiStatus);
        if (newStatus !== localMatch.status) updates.status = newStatus;

        // Minuto transcurrido
        const elapsed = apiStatus.elapsed || null;
        if (elapsed !== localMatch.elapsed) updates.elapsed = elapsed;

        // Fixture ID de API-Football para referencia
        if (fixture.fixture?.id && !localMatch.fixture_api_id) {
          updates.fixture_api_id = fixture.fixture.id;
        }

        if (Object.keys(updates).length > 0) {
          try {
            await api.entities.Match.update(localMatch.id, updates);
            totalUpdated++;
          } catch (e) {
            errors.push(`Error actualizando match ${localMatch.fixture_id}: ${e.message}`);
          }
        }
      }
    } catch (e) {
      errors.push(`Error en fecha ${dateStr}: ${e.message}`);
    }
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
