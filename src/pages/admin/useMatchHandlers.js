import { useMutation, useQueryClient } from '@tanstack/react-query';
import { api } from '@/api/client';
import { db } from '@/lib/db';
import { syncWithBestSource, checkAllSources } from '@/api/dataSources';
import { seedAllMatches } from '@/api/seedMatches';
import { evaluateMatchPredictions } from '@/api/evaluateMatchPredictions';
import { toast } from 'sonner';

const LOCK_HOURS = 24;

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

  const refreshSources = async () => {
    setSourceState(prev => ({ ...prev, sources: [] }));
    const sources = await checkAllSources();
    setSourceState(prev => ({ ...prev, sources }));
  };

  const handleSyncNow = async () => {
    setSourceState(prev => ({ ...prev, syncing: true }));
    try {
      const result = await syncWithBestSource();
      await refreshSources();
      queryClient.invalidateQueries({ queryKey: ['admin-matches-sorted'] });
      if (result.source === 'manual' && (!result.errors || result.errors.length === 0)) {
        toast.info('Sin fuente automática. Ingresa resultados manualmente abajo.');
      } else if (result.updated > 0) {
        toast.success(`✅ ${result.updated} resultados actualizados vía ${result.source}`);
      } else if (result.synced > 0) {
        toast.success(`✓ ${result.synced} revisados — sin cambios`);
      } else if (result.error) {
        toast.error(result.error);
      } else {
        toast('Sin novedades');
      }
    } catch (e) {
      toast.error('Error de sincronización: ' + e.message);
    } finally {
      setSourceState(prev => ({ ...prev, syncing: false }));
    }
  };

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

  const seedMutation = useMutation({
    mutationFn: () => seedAllMatches(api),
    onSuccess: (created) => {
      queryClient.invalidateQueries({ queryKey: ['admin-matches-sorted'] });
      toast.success(`✅ ¡${created.length} partidos del Mundial 2026 creados!`);
    },
    onError: (err) => toast.error(err?.message || 'Error al seedear partidos'),
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

  const handleStatusChange = async (match, newStatus) => {
    const extra = newStatus === 'live' ? { elapsed: '0', live_started_at: new Date().toISOString() } : {};
    if ((newStatus === 'pending' || newStatus === 'open' || newStatus === 'closed') &&
        (match.status === 'live' || match.status === 'finished')) {
      extra.result_team1 = null;
      extra.result_team2 = null;
      extra.elapsed = null;
      extra.live_started_at = null;
    }
    try {
      await api.entities.Match.update(match.id, { status: newStatus, ...extra });
      queryClient.invalidateQueries({ queryKey: ['admin-matches-sorted'] });
      toast.success('Partido actualizado');
      if (newStatus === 'finished' && match.result_team1 != null && match.result_team2 != null) {
        const evalResult = await evaluateMatchPredictions(match.id, match.result_team1, match.result_team2);
        if (evalResult.correct > 0) {
          toast.success(`✅ ${evalResult.correct} pronóstico${evalResult.correct > 1 ? 's' : ''} acertado${evalResult.correct > 1 ? 's' : ''}`);
        } else if (evalResult.evaluated > 0) {
          toast.info(`📊 ${evalResult.evaluated} pronóstico${evalResult.evaluated > 1 ? 's' : ''} evaluado${evalResult.evaluated > 1 ? 's' : ''} — sin aciertos`);
        }
        queryClient.invalidateQueries({ queryKey: ['ranking'] });
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
    queryClient.invalidateQueries({ queryKey: ['admin-matches-sorted'] });
    queryClient.invalidateQueries({ queryKey: ['ranking'] });
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
        if (!canPublishResult(match)) { console.warn(`Saltando match ${matchId}: no está en vivo ni finalizado`); return; }
        const resultTeam1 = Number(r.team1);
        const resultTeam2 = Number(r.team2);
        await api.entities.Match.update(matchId, { result_team1: resultTeam1, result_team2: resultTeam2, status: 'finished' });
        const evalResult = await evaluateMatchPredictions(matchId, resultTeam1, resultTeam2);
        totalCorrect += evalResult.correct;
        return matchId;
      })
    );
    published = publishResults.filter(r => r.status === 'fulfilled' && r.value).length;
    queryClient.invalidateQueries({ queryKey: ['admin-matches-sorted'] });
    queryClient.invalidateQueries({ queryKey: ['ranking'] });
    setResults(prev => ({ ...prev, bulk: {} }));
    if (totalCorrect > 0) {
      toast.success(`✅ ${published} partidos finalizados — ${totalCorrect} pronóstico${totalCorrect > 1 ? 's' : ''} acertado${totalCorrect > 1 ? 's' : ''}`);
    } else {
      toast.success(`✅ ${published} partidos finalizados y pronósticos evaluados`);
    }
  };

  return {
    handleSyncNow,
    refreshSources,
    hasLockedMatches,
    resetAllMatches,
    seedMutation,
    handleClearAll,
    createMatch,
    handleStatusChange,
    handlePublishResult,
    handleBatchPublish,
  };
}
