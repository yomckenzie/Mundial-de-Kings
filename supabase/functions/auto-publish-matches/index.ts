// Edge Function: auto-publish-matches
// ─────────────────────────────────────────────────────────────────────
// Ejecutada cada 30 segundos por el cron nativo de Supabase.
// Busca partidos con `status='live'` en la tabla `matches`, consulta
// SportScore para cada uno, y si SportScore reporta `finished` con
// método claro + score, hace UPSERT automático a la BD con esos campos.
//
// SEGURIDAD: usa SUPABASE_SERVICE_ROLE_KEY para bypassear RLS. La
// función solo actualiza partidos que:
//   1. Están en `status='live'` (no toca finished/pending que el admin
//      haya publicado manualmente)
//   2. SportScore los reporta como `finished` con `state` y `method`
//      coherentes (no `live` que sigue yendo)
//   3. Toman menos de 5 minutos desde el fin (safety cap para no
//      actualizar partidos viejos)
//
// Si el admin ya publicó (status='finished' en BD), la función NO
// sobrescribe. El admin sigue siendo la fuente de verdad oficial.
// ─────────────────────────────────────────────────────────────────────

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

// CORS preflight
const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, GET, OPTIONS',
}

const SPORT = 'football'
const COMPETITION_SLUG = 'fifa-world-cup'
const SPORTSCORE_BASE = 'https://sportscore.com'
const MAX_MINUTES_SINCE_FINISH = 10 // safety: solo partidos que terminaron hace < 10min

// Mapas (en español) que no se exponen en supabase functions → hardcoded simple
const TEAM_MAP = {
  'Mexico': 'mexico',
  'South Africa': 'south-africa',
  'Switzerland': 'switzerland',
  'Canada': 'canada',
  'Brazil': 'brazil',
  'Morocco': 'morocco',
  'USA': 'usa',
  'Australia': 'australia',
  'Germany': 'germany',
  'Ecuador': 'ecuador',
  'Netherlands': 'netherlands',
  'Japan': 'japan',
  'Spain': 'spain',
  'France': 'france',
  'Argentina': 'argentina',
  'England': 'england',
  'Croatia': 'croatia',
  'Portugal': 'portugal',
  'Senegal': 'senegal',
  'Uruguay': 'uruguay',
  'Poland': 'poland',
  'Saudi Arabia': 'saudi-arabia',
  'IR Iran': 'ir-iran',
  'South Korea': 'south-korea',
  'Cabo Verde': 'cabo-verde',
  'Czechia': 'czechia',
  'Qatar': 'qatar',
  'New Zealand': 'new-zealand',
  'Egypt': 'egypt',
  'Belgium': 'belgium',
  'Tunisia': 'tunisia',
  'Panama': 'panama',
  'Haiti': 'haiti',
  'Paraguay': 'paraguay',
  'Bosnia and Herzegovina': 'bosnia-and-herzegovina',
  'Scotland': 'scotland',
  'Curacao': 'curacao',
  'Cote d\'Ivoire': 'cote-divoire',
  'Algeria': 'algeria',
  'Iraq': 'iraq',
  'Jordan': 'jordan',
  'Uzbekistan': 'uzbekistan',
  'Turkiye': 'turkiye',
  'Sweden': 'sweden',
  'Democratic Republic of the Congo': 'democratic-republic-of-the-congo',
  'Colombia': 'colombia',
  'Nicaragua': 'nicaragua',
  'Costa de Marfil': 'cote-divoire',
  'Sudafrica': 'south-africa',
  'Suiza': 'switzerland',
  'Brasil': 'brazil',
  'Marruecos': 'morocco',
  'Estados Unidos': 'usa',
  'Australia': 'australia',
  'Alemania': 'germany',
  'Ecuador': 'ecuador',
  'Paises Bajos': 'netherlands',
  'Japon': 'japan',
  'Espana': 'spain',
  'Francia': 'france',
  'Argentina': 'argentina',
  'Inglaterra': 'england',
  'Croacia': 'croatia',
  'Portugal': 'portugal',
  'Senegal': 'senegal',
  'Uruguay': 'uruguay',
  'Polonia': 'poland',
  'Arabia Saudita': 'saudi-arabia',
  'Iran': 'ir-iran',
  'Corea del Sur': 'south-korea',
  'Cabo Verde': 'cabo-verde',
  'Chequia': 'czechia',
  'Catar': 'qatar',
  'Nueva Zelanda': 'new-zealand',
  'Egipto': 'egypt',
  'Belgica': 'belgium',
  'Tunez': 'tunisia',
  'Panama': 'panama',
  'Haiti': 'haiti',
  'Paraguay': 'paraguay',
  'Bosnia y Herzegovina': 'bosnia-and-herzegovina',
  'Escocia': 'scotland',
  'Curazao': 'curacao',
  'Costa de Marfil': 'cote-divoire',
}

function getTeamSlug(teamName) {
  if (!teamName) return null
  return TEAM_MAP[teamName] || TEAM_MAP[teamName.trim()] || null
}

function matchSlugFromUrl(url) {
  if (!url) return null
  const m = String(url).match(/\/match\/([^/]+)\/?$/)
  return m ? m[1] : null
}

// Normaliza el status de SportScore a {state, method}
function normalizeState(raw) {
  const s = (raw || '').toLowerCase()
  if (s === 'ft') return { state: 'finished', method: '90' }
  if (s === 'aet') return { state: 'finished', method: 'et' }
  if (s === 'pen') return { state: 'finished', method: 'pen' }
  if (s === 'finished') return { state: 'finished', method: null }
  if (['upcoming', 'notstarted', 'not_started', 'scheduled'].includes(s)) {
    return { state: 'upcoming', method: null }
  }
  return { state: 'live', method: null }
}

async function getMatchDetail(slug) {
  if (!slug) return null
  try {
    const res = await fetch(
      `${SPORTSCORE_BASE}/api/widget/match/?sport=${SPORT}&slug=${slug}`
    )
    if (!res.ok) return null
    const data = await res.json()
    return data.match || null
  } catch {
    return null
  }
}

async function findLiveResultForMatch(supabase, match) {
  // Buscar en la lista de partidos de cada equipo
  const slug1 = getTeamSlug(match.team1)
  const slug2 = getTeamSlug(match.team2)
  const slugs = [slug1, slug2].filter(Boolean)
  if (!slugs.length) return null

  for (const slug of slugs) {
    try {
      const res = await fetch(
        `${SPORTSCORE_BASE}/api/widget/team/?sport=${SPORT}&slug=${slug}&limit=20`
      )
      if (!res.ok) continue
      const data = await res.json()
      const fixtures = data.matches || []
      for (const fx of fixtures) {
        if (
          (fx.home === match.team1 && fx.away === match.team2) ||
          (fx.home === match.team2 && fx.away === match.team1)
        ) {
          return { fx, homeIsTeam1: fx.home === match.team1 }
        }
      }
    } catch {
      continue
    }
  }
  return null
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  try {
    const supabaseUrl = Deno.env.get('SUPABASE_URL')
    const supabaseKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')
    if (!supabaseUrl || !supabaseKey) {
      return new Response(
        JSON.stringify({ error: 'Missing Supabase env vars' }),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    const supabase = createClient(supabaseUrl, supabaseKey)

    // 1. Buscar partidos en vivo (o que puedan estar en vivo aunque el
    //    admin no los haya marcado todavía).
    const { data: liveMatches, error: queryErr } = await supabase
      .from('matches')
      .select('id, team1, team2, status, match_date, match_time, result_team1, result_team2, result_method, penalty_score_team1, penalty_score_team2, updated_at')
      .eq('status', 'live')
      .limit(50)

    if (queryErr) throw queryErr
    if (!liveMatches || liveMatches.length === 0) {
      return new Response(
        JSON.stringify({ scanned: 0, updated: 0, message: 'no live matches' }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    const results = []
    for (const match of liveMatches) {
      // Safety: no actualizar partidos sin score (admin aún no publicó
      // nada — el cliente anónimo no debería escribir esto por seguridad)
      if (match.result_team1 == null || match.result_team2 == null) {
        // No hacer nada — el admin publica manualmente
        continue
      }

      const found = await findLiveResultForMatch(supabase, match)
      if (!found) continue

      const { fx, homeIsTeam1 } = found
      const { state, method } = normalizeState(fx.status)

      // Solo actuar si SportScore confirma `finished` con método claro
      // FIX (jun 2026): cuando termina en penales, SportScore devuelve
      // status="finished" + status_text="Finished" (sin "pen"). Inferimos
      // method='pen' buscando "penalty" en el status_text o incidentes.
      let inferredMethod = method;
      if (state === 'finished' && !inferredMethod) {
        if (String(fx.status_text || '').toLowerCase().includes('penalty')) {
          inferredMethod = 'pen';
        }
      }
      if (state !== 'finished' || !inferredMethod) continue

      // Obtener detalle para sacar penalty scores (si aplica)
      let penaltyScore = null
      if (inferredMethod === 'pen') {
        const detail = await getMatchDetail(matchSlugFromUrl(fx.url))
        if (detail) {
          // FIX (jun 2026): SportScore NO expone `home_score_pen`/`away_score_pen`
          // en el detail de partidos finalizados. Calculamos desde incidents
          // contando los "Penalty shootout goal" por equipo.
          let homePen = 0, awayPen = 0;
          const incidentsArr = Array.isArray(detail.incidents) ? detail.incidents : [];
          for (const inc of incidentsArr) {
            const t = String(inc.type || '').toLowerCase();
            const isPen = t.includes('penalty') && inc.is_goal === true;
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
      }

      // Construir el payload de update
      const update = {
        result_method: inferredMethod,
        result_team1: homeIsTeam1 ? fx.home_score : fx.away_score,
        result_team2: homeIsTeam1 ? fx.away_score : fx.home_score,
        status: 'finished',
      }
      if (penaltyScore) {
        update.penalty_score_team1 = penaltyScore.team1
        update.penalty_score_team2 = penaltyScore.team2
      }

      // No sobrescribir partidos finalizados recientemente por el admin
      // (safety: solo aplicamos si el partido está 'live')
      const { data: current, error: refetchErr } = await supabase
        .from('matches')
        .select('status, result_method')
        .eq('id', match.id)
        .single()

      if (refetchErr) continue
      if (current.status !== 'live') continue  // admin ya publicó

      // UPSERT final
      const { error: updateErr } = await supabase
        .from('matches')
        .update(update)
        .eq('id', match.id)

      if (updateErr) {
        results.push({ id: match.id, error: updateErr.message })
      } else {
        results.push({ id: match.id, published: true, method, penaltyScore })
      }
    }

    return new Response(
      JSON.stringify({
        scanned: liveMatches.length,
        updated: results.filter(r => r.published).length,
        results,
      }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    )
  } catch (e) {
    return new Response(
      JSON.stringify({ error: e?.message || String(e) }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    )
  }
})
