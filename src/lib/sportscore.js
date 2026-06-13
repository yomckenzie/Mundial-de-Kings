// ─────────────────────────────────────────────────────────────────
// Cliente de la API pública de SportScore (gratis, sin key, JSON, CORS-open).
// Empareja un partido de NUESTRA tabla `matches` (equipos en español) con su
// marcador/estado en vivo de la Copa del Mundo FIFA en SportScore.
//
// Términos de SportScore: requiere un backlink visible "Powered by SportScore".
// https://sportscore.com/developers/terms/
//
// Funciona en navegador y en Node (usa fetch global).
// ─────────────────────────────────────────────────────────────────

import { toEnglishKey, normalizeTeam } from './worldCupTeams.js';

const BASE = 'https://sportscore.com';
const SPORT = 'football';
const COMPETITION_SLUG = 'fifa-world-cup';

// Cache del mapa {nombreInglesNormalizado → teamSlug}, construido desde standings.
let _slugMapCache = null;
let _slugMapAt = 0;
const SLUG_TTL_MS = 6 * 60 * 60 * 1000; // 6h: los equipos no cambian durante el torneo

async function _getJson(path) {
  const res = await fetch(`${BASE}${path}`);
  if (!res.ok) throw new Error(`SportScore ${path} → HTTP ${res.status}`);
  return res.json();
}

// Construye {englishKey → slug} a partir de la tabla de posiciones de la Copa.
export async function getTeamSlugMap() {
  const now = Date.now();
  if (_slugMapCache && (now - _slugMapAt) < SLUG_TTL_MS) return _slugMapCache;
  const data = await _getJson(`/api/widget/standings/?sport=${SPORT}&slug=${COMPETITION_SLUG}`);
  const map = {};
  for (const table of (data.tables || [])) {
    for (const row of (table.rows || [])) {
      if (row.team && row.team_slug) map[normalizeTeam(row.team)] = row.team_slug;
    }
  }
  _slugMapCache = map;
  _slugMapAt = now;
  return map;
}

// ¿El texto de estado corresponde al descanso (medio tiempo)?
function isHalftime(statusText) {
  const s = (statusText || '').toLowerCase();
  return s === 'ht' || s.includes('half-time') || s.includes('halftime') || s.includes('half time') || s === 'descanso';
}

// Normaliza el status crudo de SportScore a uno de los nuestros.
function normalizeState(raw) {
  const s = (raw || '').toLowerCase();
  if (s === 'finished' || s === 'ft' || s === 'aet' || s === 'pen') return 'finished';
  if (s === 'upcoming' || s === 'notstarted' || s === 'not_started' || s === 'scheduled') return 'upcoming';
  // Cualquier otra cosa (inprogress, live, 1h, 2h, ht, inplay) = en vivo
  return 'live';
}

// Extrae el slug del match desde su URL: "/football/match/paraguay-vs-usa/" → "paraguay-vs-usa"
function matchSlugFromUrl(url) {
  return (url || '').match(/\/match\/([^/]+)\/?$/)?.[1] || null;
}

// Trae el detalle del match (incluye live_minute real) desde el endpoint de detalle.
// Devuelve null si falla — el llamador cae al status_text genérico.
async function _getMatchDetail(slug) {
  if (!slug) return null;
  try {
    const data = await _getJson(`/api/widget/match/?sport=${SPORT}&slug=${slug}`);
    return data.match || null;
  } catch {
    return null;
  }
}

// Construye el texto de minuto a mostrar a partir del estado en vivo.
// Prioriza el live_minute real; si no hay, cae a HT o al status_text.
// Formatea el minuto de SportScore a texto para mostrar. SportScore puede
// devolver "86", "90+" o "90+2" (tiempo añadido). Devuelve null si no es un
// minuto válido (sin dígitos), para caer al status_text.
function formatMinute(liveMinute) {
  if (liveMinute == null) return null;
  const s = String(liveMinute).trim();
  if (!/\d/.test(s)) return null;          // "" o texto raro → no es minuto
  return s.endsWith('+') ? s : `${s}'`;    // "90+" tal cual; "86" → "86'"
}

function buildLiveLabel(state, statusText, liveMinute) {
  if (state === 'finished') return 'Finalizado';
  if (state === 'upcoming') return statusText || 'Por jugar';
  // live
  if (isHalftime(statusText)) return 'HT';
  return formatMinute(liveMinute) || statusText || 'En vivo';
}

/**
 * Busca el resultado/estado en vivo de un partido nuestro.
 * @param {{team1:string, team2:string}} match  equipos en español
 * @returns {Promise<null | {
 *   state: 'live'|'finished'|'upcoming',
 *   label: string,                  // "67'", "HT", "Finalizado"...
 *   minute: string|null,            // minuto real crudo ("86", "90+"); solo en vivo
 *   team1Score: number, team2Score: number,  // orientados a NUESTRO team1/team2
 *   raw: object
 * }>}  null si no se puede emparejar (placeholder, equipo no encontrado, sin fixture)
 */
export async function getLiveResultForMatch(match) {
  const k1 = toEnglishKey(match.team1);
  const k2 = toEnglishKey(match.team2);
  if (!k1 || !k2) return null;

  const slugMap = await getTeamSlugMap();
  const slug1 = slugMap[k1];
  const slug2 = slugMap[k2];

  // Buscar en ambos equipos (hasta 30 matches cada uno para mayor cobertura)
  const slugsToTry = [];
  if (slug1) slugsToTry.push(slug1);
  if (slug2) slugsToTry.push(slug2);
  if (!slugsToTry.length) return null;

  for (const querySlug of slugsToTry) {
    try {
      const data = await _getJson(`/api/widget/team/?sport=${SPORT}&slug=${querySlug}&limit=30`);
      const fixtures = data.matches || [];

      // Buscar el fixture donde el rival coincide
      for (const fx of fixtures) {
        const home = normalizeTeam(fx.home);
        const away = normalizeTeam(fx.away);
        const isMatch = (home === k1 && away === k2) || (home === k2 && away === k1);
        if (!isMatch) continue;

        const state = normalizeState(fx.status);
        const homeIsTeam1 = home === k1;
        const team1Score = homeIsTeam1 ? fx.home_score : fx.away_score;
        const team2Score = homeIsTeam1 ? fx.away_score : fx.home_score;

        // Solo si está EN VIVO pedimos el detalle para el minuto real.
        // (Una llamada extra por partido en vivo; los finalizados/próximos no la necesitan.)
        // El minuto se conserva como texto crudo ("86", "90+", "90+2") — no se
        // fuerza a número porque el tiempo añadido no es numérico.
        let minute = null;
        if (state === 'live') {
          const detail = await _getMatchDetail(matchSlugFromUrl(fx.url));
          const m = detail?.live_minute;
          if (m != null && String(m).trim() !== '') minute = String(m).trim();
        }

        return {
          state,
          label: buildLiveLabel(state, fx.status_text, minute),
          minute,
          team1Score: team1Score ?? null,
          team2Score: team2Score ?? null,
          raw: fx,
        };
      }
    } catch {
      // Silencioso: si un equipo falla, intentamos el otro.
    }
  }
  return null;
}
