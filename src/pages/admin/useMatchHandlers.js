import React from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { api } from '@/api/client';
import { evaluateMatchPredictions } from '@/api/evaluateMatchPredictions';
import { getLiveResultForMatch } from '@/lib/sportscore';
import { db } from '@/lib/db';
import { isValidTransition } from './matchTransitions';
import { toast } from 'sonner';

// Resuelve method + penales desde el form, con fallback al auto-fill desde
// el proveedor live (sportscore). El form tiene prioridad porque es lo que
// el admin acaba de tipear; el proveedor live solo sirve para partidos ya
// finalizados donde el admin no tocó nada.
//
// FIX (bug v2-79): si después de los dos pasos method sigue null, inferir
// desde el marcador del partido para que el breakdown de puntos muestre el
// método correcto. Reglas:
//   - Si t1 !== t2 → '90' (ganador claro al final, no hay ET ni penales)
//   - Si t1 === t2 → 'pen' (asumimos penales si está empatado al final)
// Esto evita el bug donde el admin publica sin seleccionar método y los
// pronósticos muestran "Cómo gana ❌ 0" cuando en realidad sí acertaron.
async function resolveMethodAndPenalties(match, formEntry) {
  // 1) Si el form ya trae method/penalties, usarlos.
  if (formEntry) {
    const m = formEntry.resultMethod ?? null;
    const pT1 = formEntry.penaltyTeam1 != null && formEntry.penaltyTeam1 !== '' ? Number(formEntry.penaltyTeam1) : null;
    const pT2 = formEntry.penaltyTeam2 != null && formEntry.penaltyTeam2 !== '' ? Number(formEntry.penaltyTeam2) : null;
    if (m != null || pT1 != null || pT2 != null) {
      return { method: m, penaltyT1: pT1, penaltyT2: pT2 };
    }
  }
  // 2) Auto-fill desde el proveedor live.
  try {
    const live = await getLiveResultForMatch(match);
    if (live) {
      return {
        method: live.method ?? null,
        penaltyT1: live.penaltyScore?.team1 ?? null,
        penaltyT2: live.penaltyScore?.team2 ?? null,
      };
    }
  } catch {
    // Silencioso: si el proveedor falla, devolvemos nulls.
  }
  // 3) Fallback final: inferir método desde el marcador del form o del match.
  // Si t1 !== t2 → '90' (ganador claro). Si t1 === t2 → 'pen' (asumimos
  // penales). Esto evita guardar result_method=null en la BD cuando el admin
  // olvidó seleccionar el método en el dropdown.
  const t1 = formEntry?.team1 != null && formEntry.team1 !== ''
    ? Number(formEntry.team1)
    : match?.result_team1;
  const t2 = formEntry?.team2 != null && formEntry.team2 !== ''
    ? Number(formEntry.team2)
    : match?.result_team2;
  if (t1 != null && t2 != null && !Number.isNaN(t1) && !Number.isNaN(t2)) {
    return {
      method: t1 !== t2 ? '90' : 'pen',
      penaltyT1: null,
      penaltyT2: null,
    };
  }
  return { method: null, penaltyT1: null, penaltyT2: null };
}

const LOCK_HOURS = 24;
const PREDICTION_WINDOW_HOURS = 24;

// Estados que mantienen resultado y tiempo en vivo
const STATUS_KEEPS_RESULT = new Set(['live', 'finished']);

function isMatchLocked(match, nowMs = Date.now()) {
  if (!match.match_date) return false;
  const matchDate = new Date(`${match.match_date}T${match.match_time || '23:59'}:00`);
  if (isNaN(matchDate.getTime())) return false;
  const hoursSince = (nowMs - matchDate.getTime()) / (1000 * 60 * 60);
  return hoursSince >= LOCK_HOURS;
}

function canPublishResult(match) {
  return match.status === 'live' || match.status === 'finished';
}

export default function useMatchHandlers(matches, results, setResults, sourceState, setSourceState, liveNow) {
  const queryClient = useQueryClient();

  const lockedMatches = matches.filter(m => isMatchLocked(m, liveNow));
  const hasLockedMatches = lockedMatches.length > 0;

  // NOTA: el reinicio masivo de partidos (resetAllMatches / handleClearAll) se
  // retiró del panel por seguridad — borraba resultados, tiempos en vivo y
  // pronósticos de todos los partidos de un solo clic.

  const createMatch = useMutation({
    mutationFn: (data) => api.entities.Match.create(data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['admin-matches-sorted'] });
      toast.success('Partido creado');
    },
  });

  // Editar fecha/hora/grupo/fase de un partido existente.
  // NO permite editar equipos (cambia el sentido del partido).
  // NO permite editar partido live/finished con predicciones scored.
  const editMatch = useMutation({
    mutationFn: ({ id, data }) => api.entities.Match.update(id, data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['admin-matches-sorted'] });
      queryClient.invalidateQueries({ queryKey: ['matches'] });
      queryClient.invalidateQueries({
        predicate: (q) => Array.isArray(q.queryKey) && q.queryKey[0]?.startsWith('my-predictions')
      });
      toast.success('Partido actualizado');
    },
    onError: (err) => toast.error('Error al editar: ' + (err.message || 'Error')),
  });

  // Eliminar un partido. Las predicciones se desvinculan (match_id = null).
  const deleteMatch = useMutation({
    mutationFn: (id) => api.entities.Match.delete(id),
    onSuccess: (result) => {
      queryClient.invalidateQueries({ queryKey: ['admin-matches-sorted'] });
      queryClient.invalidateQueries({ queryKey: ['matches'] });
      queryClient.invalidateQueries({
        predicate: (q) => Array.isArray(q.queryKey) && q.queryKey[0]?.startsWith('my-predictions')
      });
      const detached = result?.detached || 0;
      toast.success(
        detached > 0
          ? `Partido eliminado · ${detached} pronóstico${detached > 1 ? 's' : ''} desvinculado${detached > 1 ? 's' : ''}`
          : 'Partido eliminado'
      );
    },
    onError: (err) => toast.error('Error al eliminar: ' + (err.message || 'Error')),
  });

  const handleStatusChange = async (match, newStatus) => {
    if (match.status === newStatus) return;

    // Validar transición legal — evita saltos raros tipo pending→finished
    // o resucitar finished sin pasar por live.
    if (!isValidTransition(match.status, newStatus)) {
      toast.error(`Transición no permitida: ${match.status} → ${newStatus}`);
      return;
    }

    const extra = {};
    if (newStatus === 'live') {
      extra.elapsed = '0';
      extra.live_started_at = new Date().toISOString();
    }
    // Reset garantizado: si salimos de un estado que mantiene resultado
    // (live/finished) hacia uno que NO lo mantiene, limpiamos resultado
    // y tiempos. Antes solo se reseteaba al ir a pending/open/closed desde
    // live/finished; ahora también se resetea al ir finished→open.
    if (STATUS_KEEPS_RESULT.has(match.status) && !STATUS_KEEPS_RESULT.has(newStatus)) {
      extra.result_team1 = null;
      extra.result_team2 = null;
      extra.elapsed = null;
      extra.live_started_at = null;
      // Limpiar también los nuevos campos para que el partido vuelva a
      // estado "sin resultado". Sin esto, al pasar finished→open seguiría
      // teniendo result_method/penalty_score_* colgados.
      extra.result_method = null;
      extra.penalty_score_team1 = null;
      extra.penalty_score_team2 = null;
    }
    const willResetResult = extra.result_team1 === null;

    try {
      await api.entities.Match.update(match.id, { status: newStatus, ...extra });
      queryClient.invalidateQueries({ queryKey: ['admin-matches-sorted'] });
      // FIX: invalidar también la lista pública para que el usuario vea
      // el cambio de status inmediatamente (no esperar 30s de polling).
      queryClient.invalidateQueries({ queryKey: ['matches'] });
      if (willResetResult) {
        toast.success(`Partido actualizado · resultado limpiado`);
      } else {
        toast.success('Partido actualizado');
      }
      // Solo evaluar si es la PRIMERA VEZ que se finaliza.
      // Si ya estaba finished, no re-ejecutar scoring (idempotencia extra).
      const alreadyFinished = match.status === 'finished' && match.result_team1 != null && match.result_team2 != null;
      if (newStatus === 'finished' && !alreadyFinished && match.result_team1 != null && match.result_team2 != null) {
        // Pasar también method/penalties: si el match ya los trae en BD los
        // usamos directo (ya finalizados con el form viejo); si no, intentar
        // auto-fill desde el proveedor live.
        const live = await resolveMethodAndPenalties(match, null);
        const evalResult = await evaluateMatchPredictions(
          match.id,
          match.result_team1,
          match.result_team2,
          match.result_method ?? live.method,
          match.penalty_score_team1 ?? live.penaltyT1,
          match.penalty_score_team2 ?? live.penaltyT2,
        );
        if (evalResult.correct > 0) {
          toast.success(`✅ ${evalResult.correct} pronóstico${evalResult.correct > 1 ? 's' : ''} acertado${evalResult.correct > 1 ? 's' : ''}`);
        } else if (evalResult.evaluated > 0) {
          toast.info(`📊 ${evalResult.evaluated} pronóstico${evalResult.evaluated > 1 ? 's' : ''} evaluado${evalResult.evaluated > 1 ? 's' : ''} — sin aciertos`);
        }
        // FIX: forzar sync FROM Supabase para que el localStorage del admin
        // (y de cualquier cliente conectado) vea scored=true/is_correct=true
        // inmediatamente. Sin esto, el admin browser tiene localStorage stale
        // con scored=false y re-evaluaría contra la UI.
        try { await db._syncSingleTableFromSupabase('predictions'); } catch (e) { /* noop */ }
        try { await db._syncSingleTableFromSupabase('users'); } catch (e) { /* noop */ }
        queryClient.invalidateQueries({ queryKey: ['ranking'] });
        queryClient.invalidateQueries({
          predicate: (q) => Array.isArray(q.queryKey) && q.queryKey[0]?.startsWith('my-predictions')
        });
      }
    } catch (e) {
      toast.error('Error al actualizar: ' + e.message);
    }
  };

  const handlePublishResult = async (match, forceFinish = false) => {
    if (!canPublishResult(match) && !forceFinish) {
      toast.error('El partido debe estar EN VIVO o FINALIZADO para actualizar el marcador.');
      return;
    }
    const r = results.form[match.id];
    // Guard: si el partido ya está finalizado con el mismo resultado + method
    // + penalties, no re-ejecutar scoring.
    if (match.status === 'finished' && match.result_team1 != null && match.result_team2 != null) {
      const sameResult = r && Number(r.team1) === match.result_team1 && Number(r.team2) === match.result_team2;
      const liveResolved = await resolveMethodAndPenalties(match, r);
      const effMethod = r?.resultMethod ?? liveResolved.method;
      const effPT1 = r?.penaltyTeam1 != null && r?.penaltyTeam1 !== '' ? Number(r.penaltyTeam1) : liveResolved.penaltyT1;
      const effPT2 = r?.penaltyTeam2 != null && r?.penaltyTeam2 !== '' ? Number(r.penaltyTeam2) : liveResolved.penaltyT2;
      const sameMethod = (effMethod ?? null) === (match.result_method ?? null);
      const samePenalty =
        (effPT1 ?? null) === (match.penalty_score_team1 ?? null) &&
        (effPT2 ?? null) === (match.penalty_score_team2 ?? null);
      if (sameResult && sameMethod && samePenalty) {
        toast.info('Este partido ya fue finalizado y evaluado.');
        return;
      }
    }
    if (r?.team1 === undefined || r?.team2 === undefined || r.team1 === '' || r.team2 === '') {
      toast.error('Ingresa el resultado de ambos equipos');
      return;
    }
    const resultTeam1 = Number(r.team1);
    const resultTeam2 = Number(r.team2);
    const { method: resultMethod, penaltyT1, penaltyT2 } = await resolveMethodAndPenalties(match, r);

    // Validar: si el método es 'pen', los penales son obligatorios.
    if (resultMethod === 'pen' && (penaltyT1 == null || penaltyT2 == null)) {
      toast.error('Si el partido terminó en penales, completa el marcador de penales.');
      return;
    }

    // FIX (bug v2-79): al PUBLICAR resultado final (forceFinish=true), el
    // método es obligatorio. Sin result_method en la BD el breakdown muestra
    // 'Cómo gana ❌ 0' aunque el pick sea correcto. La inferencia en
    // resolveMethodAndPenalties es fallback defensivo, pero la UI ya bloquea
    // el botón cuando falta, así que este caso solo se da si alguien publica
    // sin método por API directa — devolvemos un error claro igual.
    if (forceFinish && resultMethod == null) {
      toast.error('Elegí cómo terminó el partido (90 min / T. extra / Penales) antes de publicar.');
      return;
    }

    // Solo actualizar marcador en vivo (sin finalizar) cuando NO se fuerza el
    // final. Con forceFinish (botón "Publicar resultado" de un partido por
    // confirmar) se salta esta rama y se finaliza + evalúa directamente.
    if (match.status === 'live' && !forceFinish) {
      await api.entities.Match.update(match.id, { result_team1: resultTeam1, result_team2: resultTeam2 });
      setResults(prev => {
        const { [match.id]: _, ...rest } = prev.form;
        return { ...prev, form: rest };
      });
      queryClient.invalidateQueries({ queryKey: ['admin-matches-sorted'] });
      queryClient.invalidateQueries({ queryKey: ['matches'] });
      toast.success('Marcador actualizado (en vivo).');
      return;
    }

    await api.entities.Match.update(match.id, {
      result_team1: resultTeam1,
      result_team2: resultTeam2,
      result_method: resultMethod,
      penalty_score_team1: penaltyT1,
      penalty_score_team2: penaltyT2,
      status: 'finished',
    });
    const evalResult = await evaluateMatchPredictions(
      match.id, resultTeam1, resultTeam2, resultMethod, penaltyT1, penaltyT2,
    );
    setResults(prev => {
      const { [match.id]: _, ...rest } = prev.form;
      return { ...prev, form: rest };
    });
    // FIX: forzar sync FROM para que scored/is_correct se vean reflejados
    // inmediatamente en la UI del usuario (sin esperar 30s de polling).
    try { await db._syncSingleTableFromSupabase('predictions'); } catch (e) { /* noop */ }
    try { await db._syncSingleTableFromSupabase('users'); } catch (e) { /* noop */ }
    queryClient.invalidateQueries({ queryKey: ['admin-matches-sorted'] });
    queryClient.invalidateQueries({ queryKey: ['matches'] });
    queryClient.invalidateQueries({ queryKey: ['ranking'] });
    queryClient.invalidateQueries({
      predicate: (q) => Array.isArray(q.queryKey) && q.queryKey[0]?.startsWith('my-predictions')
    });
    toast.success(
      evalResult.correct > 0
        ? `✅ ${evalResult.correct} pronóstico${evalResult.correct > 1 ? 's' : ''} acertado${evalResult.correct > 1 ? 's' : ''} de ${evalResult.evaluated} evaluado${evalResult.evaluated > 1 ? 's' : ''}`
        : `${evalResult.evaluated} pronóstico${evalResult.evaluated > 1 ? 's' : ''} evaluado${evalResult.evaluated > 1 ? 's' : ''} — sin aciertos`
    );
  };

  const handleBatchPublish = async () => {
    const matchesToPublish = Object.entries(results.bulk)
      .filter(([_, r]) => r.team1 !== '' && r.team2 !== undefined && r.team1 !== undefined);
    if (matchesToPublish.length === 0) {
      toast.error('No hay resultados pendientes. Ingresa marcadores en los campos de la derecha.');
      return;
    }
    const matchById = new Map(matches.map(m => [m.id, m]));
    let published = 0;
    let totalCorrect = 0;
    const publishResults = await Promise.allSettled(
      matchesToPublish.map(async ([matchId, r]) => {
        const match = matchById.get(matchId);
        if (!match) return;
        if (!canPublishResult(match)) { return; }
        const resultTeam1 = Number(r.team1);
        const resultTeam2 = Number(r.team2);
        const { method: resultMethod, penaltyT1, penaltyT2 } = await resolveMethodAndPenalties(match, r);
        // Si el método declarado es 'pen' pero no hay penales, saltear este
        // partido — un resultado a penales sin penales es inválido.
        if (resultMethod === 'pen' && (penaltyT1 == null || penaltyT2 == null)) {
          console.warn(`[batch] Partido ${matchId}: método=pen pero penales vacíos, se saltea`);
          return;
        }
        await api.entities.Match.update(matchId, {
          result_team1: resultTeam1,
          result_team2: resultTeam2,
          result_method: resultMethod,
          penalty_score_team1: penaltyT1,
          penalty_score_team2: penaltyT2,
          status: 'finished',
        });
        const evalResult = await evaluateMatchPredictions(
          matchId, resultTeam1, resultTeam2, resultMethod, penaltyT1, penaltyT2,
        );
        totalCorrect += evalResult.correct;
        return matchId;
      })
    );
    published = publishResults.filter(r => r.status === 'fulfilled' && r.value).length;
    // FIX: forzar sync FROM tras batch publish
    try { await db._syncSingleTableFromSupabase('predictions'); } catch (e) { /* noop */ }
    try { await db._syncSingleTableFromSupabase('users'); } catch (e) { /* noop */ }
    queryClient.invalidateQueries({ queryKey: ['admin-matches-sorted'] });
    queryClient.invalidateQueries({ queryKey: ['matches'] });
    queryClient.invalidateQueries({ queryKey: ['ranking'] });
    queryClient.invalidateQueries({
      predicate: (q) => Array.isArray(q.queryKey) && q.queryKey[0]?.startsWith('my-predictions')
    });
    setResults(prev => ({ ...prev, bulk: {} }));
    if (totalCorrect > 0) {
      toast.success(`✅ ${published} partidos finalizados — ${totalCorrect} pronóstico${totalCorrect > 1 ? 's' : ''} acertado${totalCorrect > 1 ? 's' : ''}`);
    } else {
      toast.success(`✅ ${published} partidos finalizados y pronósticos evaluados`);
    }
  };

  // Partidos 'pending' dentro de las próximas 24h que deberían abrirse.
  // El admin puede revisarlos y abrirlos manualmente con 1 click.
  const suggestedToOpen = React.useMemo(() => {
    const now = liveNow;
    return matches.filter(m => {
      if (m.status !== 'pending') return false;
      if (!m.match_date) return false;
      const md = new Date(`${m.match_date}T${m.match_time || '23:59'}:00`);
      if (isNaN(md.getTime())) return false;
      const hoursToMatch = (md.getTime() - now) / (1000 * 60 * 60);
      // Sugerir si faltan entre 0 y 24h (ventana de pronósticos).
      return hoursToMatch >= 0 && hoursToMatch <= PREDICTION_WINDOW_HOURS;
    });
  }, [matches, liveNow]);

  return {
    hasLockedMatches,
    createMatch,
    editMatch,
    deleteMatch,
    handleStatusChange,
    handlePublishResult,
    handleBatchPublish,
    suggestedToOpen,
  };
}
