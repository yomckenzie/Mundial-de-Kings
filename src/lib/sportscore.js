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

// ─────────────────────────────────────────────────────────────────
// TRACKING + INTERPOLACIÓN DE MINUTO PARA FASES ESPECIALES
//
// SportScore solo expone "ET"/"HT" como texto durante tiempo extra y
// descanso (sin minuto numérico). Para mostrar el minutero durante
// estas fases (91', 95', 108', etc.) hacemos tracking de las
// transiciones y, entre polls, interpolamos basándonos en el último
// minuto conocido + tiempo transcurrido.
//
// Storage: localStorage `chessking_match_minute_<match_id>` con:
//   { phase: '1H'|'2H'|'HT'|'ET'|'PEN'|'FT', lastSeenAt, lastSeenMinute }
//────────────────────────────────────────────────────────────────

const MINUTE_LS_PREFIX = 'chessking_match_minute_';

function _readMinuteTracking(matchId) {
  if (typeof localStorage === 'undefined' || !matchId) return null;
  try {
    const raw = localStorage.getItem(MINUTE_LS_PREFIX + matchId);
    if (!raw) return null;
    return JSON.parse(raw);
  } catch {
    return null;
  }
}

function _writeMinuteTracking(matchId, data) {
  if (typeof localStorage === 'undefined' || !matchId) return;
  try {
    localStorage.setItem(MINUTE_LS_PREFIX + matchId, JSON.stringify(data));
  } catch {
    /* ignorar (cuota/SSR) */
  }
}

function _clearMinuteTracking(matchId) {
  if (typeof localStorage === 'undefined' || !matchId) return;
  try { localStorage.removeItem(MINUTE_LS_PREFIX + matchId); } catch {}
}

// Parsea el live_minute de SportScore a { phase, minute, suffix }.
// - phase:    'HT'|'ET'|'PEN'|'FT'|null
// - minute:   entero base (90 para ET, 120 para PEN, etc.)
// - suffix:   string extra para preservar formato (+'', '+', '+2', '+3')
// FIX (jun 2026): regex acepta "90+" (sin dígito post-+) y devuelve suffix
// para no perder el "+N" al formatear.
function _parseLiveMinute(liveMinute) {
  if (liveMinute == null) return { phase: null, minute: null, suffix: '' };
  const s = String(liveMinute).trim();
  if (!s) return { phase: null, minute: null, suffix: '' };
  const upper = s.toUpperCase();
  // Texto de fase (sin dígitos)
  if (upper === 'HT' || upper.includes('HALF') || upper === 'DESCANSO') {
    return { phase: 'HT', minute: 45, suffix: '' };
  }
  if (upper === 'ET' || upper === 'AET' || upper.includes('EXTRA')) {
    return { phase: 'ET', minute: 90, suffix: '' };
  }
  if (upper === 'PEN') return { phase: 'PEN', minute: 120, suffix: '' };
  if (upper === 'FT' || upper === 'FINISHED') return { phase: 'FT', minute: 90, suffix: '' };
  // Numérico: "86", "90+", "90+2", "1H", "2H", "45+3"
  // FIX (jun 2026): ambos grupos (+\d{1,2}) son opcionales para aceptar
  // "90+" (sin dígito post-+) además de "90+2" y "86".
  const m = s.match(/^(\d{1,3})(\+(\d{1,2})?)?$/);
  if (m) {
    const base = parseInt(m[1], 10);
    // Capturar el sufijo completo ("+", "+2", "+3", etc.) para preservarlo.
    const suffix = m[2] ? m[2] : '';
    return { phase: null, minute: base, suffix };
  }
  return { phase: null, minute: null, suffix: '' };
}

// Interpola el minuto "ahora" basándose en el último tracking.
// Devuelve string formateado ("67'", "HT", "108'") o null si no hay datos.
// FIX (jun 2026): preserva el suffix (+, +2, +3) al interpolar para no
// perder el formato "tiempo añadido" mientras avanza el minutero.
function _interpolateMinute(prev, now) {
  if (!prev) return null;
  const elapsedMin = (now - prev.lastSeenAt) / 60000;
  const interpolated = Math.floor(prev.lastSeenMinute + elapsedMin);
  if (interpolated > 130) return null;
  if (prev.phase === 'PEN') return 'PEN';
  if (prev.phase === 'HT') return 'HT';
  const suffix = prev.suffix || '';
  return `${interpolated}${suffix}'`;
}

/**
 * Trackea la fase/minuto del partido y, entre polls, interpola el minutero
 * exacto basándose en el último valor conocido + tiempo transcurrido.
 *
 * Llamar en cada poll. El primer poll establece la línea base; los
 * siguientes interpolan hasta que llegue un nuevo valor real.
 *
 * @param {string} matchId
 * @param {string|null} liveMinute  valor crudo de SportScore ("86", "ET", "HT", null)
 * @param {number|null} lastIncidentMinute  minuto del incident más reciente
 *                                        del detail de SportScore. Útil para
 *                                        anclar el minutero cuando el live_minute
 *                                        es fijo (ET) y no avanza con polls.
 * @returns {string|null}  texto a mostrar ("67'", "HT", "108'") o null si no hay datos
 */
export function trackAndInterpolateMinute(matchId, liveMinute, lastIncidentMinute = null) {
  const now = Date.now();
  const parsed = _parseLiveMinute(liveMinute);
  const incoming = parsed.phase
    ? { phase: parsed.phase, minute: parsed.minute, suffix: '' }
    : parsed.minute != null
    ? { phase: null, minute: parsed.minute, suffix: parsed.suffix }
    : null;

  // FIX (jun 2026): cuando incoming es una fase fija (ET/HT/PEN) y el detail
  // trae un incident reciente con `time`, usamos ESE como base. SportScore
  // devuelve "ET" como string fijo durante todo el tiempo extra, pero los
  // incidents sí se actualizan con el minuto real (último incident = minuto
  // aproximado del partido).
  if (incoming && incoming.phase && lastIncidentMinute != null && lastIncidentMinute > incoming.minute) {
    incoming.minute = lastIncidentMinute;
    incoming.suffix = ''; // fase fija: sin sufijo
  }

  const prev = _readMinuteTracking(matchId);

  // FIX (jun 2026): si el poll entrante es una fase fija SIN incident nuevo
  // pero el tracking previo SÍ está anclado a un incident mayor, mantenemos
  // el anclaje del tracking previo. Sin esto, el 2do poll resetea el minutero
  // al valor de la fase (90') y pierde el incident (113') del poll anterior.
  if (incoming && incoming.phase && prev && prev.phase === incoming.phase
      && prev.lastSeenMinute > incoming.minute
      && lastIncidentMinute == null) {
    incoming.minute = prev.lastSeenMinute;
    incoming.suffix = prev.suffix || '';
  }

  // Caso 1: el partido ya terminó → limpiamos y devolvemos "Finalizado"
  if (incoming && incoming.phase === 'FT') {
    _clearMinuteTracking(matchId);
    return 'Finalizado';
  }

  // Caso 2: tenemos un valor entrante (numérico o de fase) → guardamos
  // como nueva línea base SOLO si cambió (fase distinta o minuto distinto).
  // Si es la misma fase + mismo minuto que el último poll, NO actualizamos
  // el timestamp: eso permite que la interpolación avance entre polls
  // (caso crítico en tiempo extra, donde SportScore devuelve "ET" fijo).
  if (incoming) {
    const sameAsPrev = prev
      && prev.phase === incoming.phase
      && prev.lastSeenMinute === incoming.minute;

    if (sameAsPrev) {
      return _interpolateMinute(prev, now);
    }

    _writeMinuteTracking(matchId, {
      phase: incoming.phase,
      lastSeenAt: now,
      lastSeenMinute: incoming.minute,
      suffix: incoming.suffix || '', // FIX (jun 2026): persistir "+", "+2", etc.
    });
    if (incoming.phase === 'HT') return 'HT';
    if (incoming.phase === 'PEN') return 'PEN';
    return incoming.suffix ? `${incoming.minute}${incoming.suffix}` : `${incoming.minute}'`;
  }

  // Caso 3: NO tenemos valor entrante y NO hay tracking previo → no podemos
  // hacer nada.
  if (!prev) return null;

  // Caso 4: NO hay valor entrante PERO sí tracking previo → INTERPOLAR.
  const interpolatedMin = Math.floor(prev.lastSeenMinute + (now - prev.lastSeenAt) / 60000);
  if (interpolatedMin > 130) return null;
  if (prev.phase === 'PEN') return 'PEN';
  if (prev.phase === 'HT') return 'HT';
  const suffix = prev.suffix || '';
  return suffix ? `${interpolatedMin}${suffix}` : `${interpolatedMin}'`;
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
        let lastIncidentMin = null;
        const needsDetail = state === 'live' || (state === 'finished' && method === 'pen');
        if (needsDetail) {
          const detail = await _getMatchDetail(matchSlugFromUrl(fx.url));
          if (state === 'live') {
            const m = detail?.live_minute;
            if (m != null && String(m).trim() !== '') minute = String(m).trim();
            // FIX (jun 2026): capturar el incident más reciente (con `time` en
            // minutos del partido) para anclar el minutero cuando live_minute
            // es un string fijo como "ET". Esto evita que la UI muestre un
            // minutero atrasado cuando la página se carga tarde en el partido.
            const incidentsArr = Array.isArray(detail?.incidents) ? detail.incidents : [];
            if (incidentsArr.length > 0) {
              const maxT = Math.max(...incidentsArr.map(i => Number(i.time) || 0));
              if (maxT > 0) lastIncidentMin = maxT;
            }
            // FIX (jun 2026): calcular score de pen desde los incidents.
            // SportScore NO expone `home_score_pen` / `away_score_pen` en el
            // detail, pero cada gol de pen aparece como incident con type
            // "Penalty shootout goal". Contamos goles por equipo.
            // FIX (jul 2026): BUG CRÍTICO — la variable `hasPenaltyText` que
            // estaba acá NUNCA fue definida. Esto causaba un ReferenceError
            // que era silenciado por el catch del slug loop, dejando
            // `matchedFixture = null` para TODOS los partidos en vivo (no
            // solo los de penalty). Resultado: la UI mostraba "- - -" en
            // lugar del marcador en vivo. Reemplazamos con una verificación
            // del status_text del fixture (SportScore lo usa durante la
            // tanda: "Penalties", "Penalty shootout", etc.).
            const fxStatusText = String(fx.status_text || '').toLowerCase();
            const isLivePenaltyNow = fxStatusText.includes('penalty')
              || fxStatusText.includes('penales')
              || String(detail?.live_minute || '').toUpperCase() === 'PEN';
            if (isLivePenaltyNow && incidentsArr.length > 0) {
              let homePen = 0, awayPen = 0;
              for (const inc of incidentsArr) {
                const isPen = (inc.type || '').toLowerCase().includes('penalty')
                  && (inc.is_goal === true);
                if (!isPen) continue;
                if (inc.side === 'home') homePen++;
                else if (inc.side === 'away') awayPen++;
              }
              if (homePen > 0 || awayPen > 0) {
                penaltyScore = {
                  team1: homeIsTeam1 ? homePen : awayPen,
                  team2: homeIsTeam1 ? awayPen : homePen,
                };
              }
            }
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
          lastIncidentMinute: lastIncidentMin,  // para anclar minutero en ET
        };
      }
    } catch {
      // Silencioso: si un equipo falla, dejamos que el otro encuentre el match.
    }
  }));

  return matchedFixture;
}
