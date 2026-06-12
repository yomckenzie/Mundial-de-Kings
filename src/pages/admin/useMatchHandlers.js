import React from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { api } from '@/api/client';
import { evaluateMatchPredictions } from '@/api/evaluateMatchPredictions';
import { toast } from 'sonner';

const LOCK_HOURS = 24;
const PREDICTION_WINDOW_HOURS = 24;

// Estados que mantienen resultado y tiempo en vivo
const STATUS_KEEPS_RESULT = new Set(['live', 'finished']);

// Matriz de transiciones legales.
// pending → open, closed
// open → live, closed, pending
// live → finished, closed
// closed → live, finished
// finished → live, open
const VALID_TRANSITIONS = {
  pending:  new Set(['open', 'closed']),
  open:     new Set(['live', 'closed', 'pending']),
  live:     new Set(['finished', 'closed']),
  closed:   new Set(['live', 'finished']),
  finished: new Set(['live', 'open']),
};

function isValidTransition(from, to) {
  if (from === to) return true;
  return VALID_TRANSITIONS[from]?.has(to) ?? false;
}

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

  const resetAllMatches = useMutation({
    mutationFn: () => api.entities.Match.resetAll(),
    onSuccess: () => {
      setResults(prev => ({ ...prev, form: {} }));
      queryClient.invalidateQueries({ queryKey: ['admin-matches-sorted'] });
      queryClient.invalidateQueries({ queryKey: ['ranking'] });
      toast.success('✅ Todos los partidos reiniciados a Pendiente');
    },
  });

  const handleClearAll = () => {
    const msg = hasLockedMatches
      ? `Hay ${lockedMatches.length} partido${lockedMatches.length > 1 ? 's' : ''} con más de 24h. ¿Reiniciar TODOS a Pendiente de todas formas?`
      : '¿Reiniciar TODOS los partidos a Pendiente?\n\nSe borrarán resultados, tiempos en vivo y pronósticos de usuarios. Los partidos NO se eliminan.';
    if (window.confirm(msg)) {
      resetAllMatches.mutate();
    }
  };

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
        const evalResult = await evaluateMatchPredictions(match.id, match.result_team1, match.result_team2);
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

  const handlePublishResult = async (match) => {
    if (!canPublishResult(match)) {
      toast.error('El partido debe estar EN VIVO o FINALIZADO para actualizar el marcador.');
      return;
    }
    // Guard: si el partido ya está finalizado con el mismo resultado, no re-ejecutar scoring
    if (match.status === 'finished' && match.result_team1 != null && match.result_team2 != null) {
      const r = results.form[match.id];
      const sameResult = r && Number(r.team1) === match.result_team1 && Number(r.team2) === match.result_team2;
      if (sameResult || !r || r.team1 === '' || r.team2 === '') {
        toast.info('Este partido ya fue finalizado y evaluado.');
        return;
      }
    }
    const r = results.form[match.id];
    if (r?.team1 === undefined || r?.team2 === undefined || r.team1 === '' || r.team2 === '') {
      toast.error('Ingresa el resultado de ambos equipos');
      return;
    }
    const resultTeam1 = Number(r.team1);
    const resultTeam2 = Number(r.team2);

    if (match.status === 'live') {
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
      result_team1: resultTeam1, result_team2: resultTeam2, status: 'finished',
    });
    const evalResult = await evaluateMatchPredictions(match.id, resultTeam1, resultTeam2);
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
        await api.entities.Match.update(matchId, { result_team1: resultTeam1, result_team2: resultTeam2, status: 'finished' });
        const evalResult = await evaluateMatchPredictions(matchId, resultTeam1, resultTeam2);
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
    resetAllMatches,
    handleClearAll,
    createMatch,
    editMatch,
    deleteMatch,
    handleStatusChange,
    handlePublishResult,
    handleBatchPublish,
    suggestedToOpen,
  };
}
