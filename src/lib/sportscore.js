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
const SLUG_LS_KEY = 'chessking_sportscore_slugmap'; // persiste el mapa entre recargas

async function _getJson(path) {
  const res = await fetch(`${BASE}${path}`);
  if (!res.ok) throw new Error(`SportScore ${path} → HTTP ${res.status}`);
  return res.json();
}

// Construye {englishKey → slug} a partir de la tabla de posiciones de la Copa.
export async function getTeamSlugMap() {
  const now = Date.now();
  // 1) Cache en memoria (sesión actual)
  if (_slugMapCache && (now - _slugMapAt) < SLUG_TTL_MS) return _slugMapCache;

  // 2) Cache en localStorage (sobrevive recargas → arranque en frío más rápido)
  try {
    if (typeof localStorage !== 'undefined') {
      const raw = localStorage.getItem(SLUG_LS_KEY);
      if (raw) {
        const parsed = JSON.parse(raw);
        if (parsed && typeof parsed.at === 'number' && (now - parsed.at) < SLUG_TTL_MS && parsed.map) {
          _slugMapCache = parsed.map;
          _slugMapAt = parsed.at;
          return _slugMapCache;
        }
      }
    }
  } catch { /* ignorar localStorage roto */ }

  // 3) Pedir a SportScore y cachear (memoria + localStorage)
  const data = await _getJson(`/api/widget/standings/?sport=${SPORT}&slug=${COMPETITION_SLUG}`);
  const map = {};
  for (const table of (data.tables || [])) {
    for (const row of (table.rows || [])) {
      if (row.team && row.team_slug) map[normalizeTeam(row.team)] = row.team_slug;
    }
  }
  _slugMapCache = map;
  _slugMapAt = now;
  try {
    if (typeof localStorage !== 'undefined') {
      localStorage.setItem(SLUG_LS_KEY, JSON.stringify({ at: now, map }));
    }
  } catch { /* ignorar (cuota/SSR) */ }
  return map;
}

// ¿El texto de estado corresponde al descanso (medio tiempo)?
function isHalftime(statusText) {
  const s = (statusText || '').toLowerCase();
  return s === 'ht' || s.includes('half-time') || s.includes('halftime') || s.includes('half time') || s === 'descanso';
}

// Normaliza el status crudo de SportScore a {state, method}.
// state: 'live' | 'finished' | 'upcoming'
// method: '90' | 'et' | 'pen' | null  (null si no se puede inferir)
export function normalizeState(raw) {
  const s = (raw || '').toLowerCase();
  if (s === 'ft') return { state: 'finished', method: '90' };
  if (s === 'aet') return { state: 'finished', method: 'et' };
  if (s === 'pen') return { state: 'finished', method: 'pen' };
  if (s === 'finished') return { state: 'finished', method: null };
  if (s === 'upcoming' || s === 'notstarted' || s === 'not_started' || s === 'scheduled')
    return { state: 'upcoming', method: null };
  // Cualquier otra cosa (inprogress, live, 1h, 2h, ht, inplay) = en vivo
  return { state: 'live', method: null };
}

// Para tests
export const _normalizeStateForTest = normalizeState;

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
 *   method: '90'|'et'|'pen'|null,  // cómo terminó (null si no se sabe)
 *   penaltyScore: {team1:number, team2:number}|null,  // marcador de penales (si aplica)
 *   label: string,                  // "67'", "HT", "Finalizado"...
 *   minute: string|null,            // minuto real crudo ("86", "90+"); solo en vivo
 *   team1Score: number, team2Score: number,  // orientados a NUESTRO team1/team2
 *   raw: object
 * }>}
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

  // Acumulador de la primera coincidencia encontrada (entre los slugs paralelos).
  let matchedFixture = null;

  // Procesamos los slugs en paralelo (cada uno puede fallar silenciosamente).
  // El primer fixture que coincida con el partido (k1 vs k2) gana — los
  // siguientes slugs se descartan al hacer `return` desde dentro del forEach.
  // Antes era un `for await` secuencial; ahora ambos endpoints se piden a la
  // vez y devolvemos el primer match, reduciendo la latencia p99 cuando el
  // primer slug tarda o falla.
  await Promise.all(slugsToTry.map(async (querySlug) => {
    try {
      const data = await _getJson(`/api/widget/team/?sport=${SPORT}&slug=${querySlug}&limit=30`);
      const fixtures = data.matches || [];

      for (const fx of fixtures) {
        const home = normalizeTeam(fx.home);
        const away = normalizeTeam(fx.away);
        const isMatch = (home === k1 && away === k2) || (home === k2 && away === k1);
        if (!isMatch) continue;

        const { state, method } = normalizeState(fx.status);
        const homeIsTeam1 = home === k1;
        const team1Score = homeIsTeam1 ? fx.home_score : fx.away_score;
        const team2Score = homeIsTeam1 ? fx.away_score : fx.home_score;

        // Solo si está EN VIVO o terminó por penales pedimos el detalle.
        // (Una llamada extra por partido en vivo o con pens; el resto no la necesita.)
        // El minuto se conserva como texto crudo ("86", "90+", "90+2") — no se
        // fuerza a número porque el tiempo añadido no es numérico.
        let minute = null;
        let penaltyScore = null;
        const needsDetail = state === 'live' || (state === 'finished' && method === 'pen');
        if (needsDetail) {
          const detail = await _getMatchDetail(matchSlugFromUrl(fx.url));
          if (state === 'live') {
            const m = detail?.live_minute;
            if (m != null && String(m).trim() !== '') minute = String(m).trim();
          } else {
            const hs = detail?.home_score_pen ?? detail?.home_pen_score;
            const aws = detail?.away_score_pen ?? detail?.away_pen_score;
            if (hs != null && aws != null) {
              penaltyScore = {
                team1: homeIsTeam1 ? hs : aws,
                team2: homeIsTeam1 ? aws : hs,
              };
            }
          }
        }

        // Guardamos la primera coincidencia y descartamos los demás resultados.
        // Nota: si dos slugs encuentran match casi a la vez, puede que gane el
        // segundo. Es aceptable porque ambos vienen de la misma fuente SportScore.
        if (matchedFixture) return; // ya tenemos match, este forEach lo ignora
        matchedFixture = {
          state,
          method,
          penaltyScore,
          label: buildLiveLabel(state, fx.status_text, minute),
          minute,
          team1Score: team1Score ?? null,
          team2Score: team2Score ?? null,
          raw: fx,
        };
      }
    } catch {
      // Silencioso: si un equipo falla, dejamos que el otro encuentre el match.
    }
  }));

  return matchedFixture;
}
