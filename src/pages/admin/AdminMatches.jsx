import React, { useState, useEffect } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { api } from '@/api/client';
import { db } from '@/lib/db';
import { toast } from 'sonner';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { AlertCircle, CheckCircle2 } from 'lucide-react';
import { formatTime12h } from '@/lib/utils';
import BatchPublishCard from './BatchPublishCard';
import QuickActions from './QuickActions';
import StatusLegend from './StatusLegend';
import MatchGroupList from './MatchGroupList';
import useMatchHandlers from '@/api/useMatchHandlers';
import { useLiveResults } from '@/pages/matches/useLiveResults';



export default function AdminMatches() {
  const queryClient = useQueryClient();
  const [results, setResults] = useState({ form: {}, bulk: {} });
  const [liveNow, setLiveNow] = useState(() => Date.now());
  const [sourceState, setSourceState] = useState({ syncing: false, show: true, deduping: false });

  // Timer en tiempo real para calcular elapsed desde live_started_at
  useEffect(() => {
    const interval = setInterval(() => setLiveNow(Date.now()), 10000);
    return () => clearInterval(interval);
  }, []);

  // ── Datos de partidos ──
  const { data: rawMatches = [], isLoading } = useQuery({
    queryKey: ['admin-matches-sorted'],
    queryFn: () => api.entities.Match.list('-match_date'),
    // Reflejar los cambios de estado que hace el cron server-side sin recargar.
    refetchInterval: 60000,
  });

  // Predicciones (para mostrar conteo y advertencia al eliminar)
  const { data: predictions = [] } = useQuery({
    queryKey: ['admin-all-predictions'],
    queryFn: () => api.entities.Prediction.list(),
  });
  const predictionCountByMatchId = React.useMemo(() => {
    const map = {};
    for (const p of predictions) {
      if (!p.match_id) continue;
      map[p.match_id] = (map[p.match_id] || 0) + 1;
    }
    return map;
  }, [predictions]);

  const matches = React.useMemo(() =>
    // Más recientes arriba (DESC por match_date, tiebreak ASC por match_time).
    // FIX 30 jun 2026: tiebreak invertido a ASC — dentro del mismo día los
    // más tempranos van arriba, los más tarde abajo (sentido cronológico).
    rawMatches.toSorted((a, b) => {
      if (a.match_date !== b.match_date) return (b.match_date || '').localeCompare(a.match_date || '');
      return (a.match_time || '').localeCompare(b.match_time || '');
    }), [rawMatches]);

  // Estado en vivo de SportScore para los partidos visibles (solo lectura).
  const liveResults = useLiveResults(matches);

  // IDs de partidos que SportScore da por finalizados y que el admin AÚN no ha
  // publicado en la BD. Se resaltan como "Resultado por confirmar".
  const pendingConfirmIds = React.useMemo(() => {
    const ids = new Set();
    for (const m of matches) {
      if (liveResults[m.id]?.state === 'finished' && m.status !== 'finished') {
        ids.add(m.id);
      }
    }
    return ids;
  }, [matches, liveResults]);

  // Precargar el marcador sugerido de SportScore en el formulario, una sola vez
  // por partido (si el admin aún no escribió nada en ese campo). Ahora también
  // pre-rellena método y marcador de penales si SportScore los detectó
  // (betting-3ways · Task 5).
  useEffect(() => {
    setResults(prev => {
      let changed = false;
      const next = { ...prev.form };
      for (const m of matches) {
        const lr = liveResults[m.id];
        if (lr?.state !== 'finished') continue;
        const existing = next[m.id] || {};
        const entry = { ...existing };
        let entryChanged = false;
        if (lr.team1Score != null && lr.team2Score != null && !existing.team1 && !existing.team2) {
          entry.team1 = String(lr.team1Score);
          entry.team2 = String(lr.team2Score);
          entryChanged = true;
        }
        if (lr.method && !existing.resultMethod) {
          entry.resultMethod = lr.method;
          entryChanged = true;
        }
        if (lr.method === 'pen' && lr.penaltyScore && (!existing.penaltyTeam1 || !existing.penaltyTeam2)) {
          entry.penaltyTeam1 = String(lr.penaltyScore.team1);
          entry.penaltyTeam2 = String(lr.penaltyScore.team2);
          entryChanged = true;
        }
        if (entryChanged) {
          next[m.id] = entry;
          changed = true;
        }
      }
      return changed ? { ...prev, form: next } : prev;
    });
  }, [matches, liveResults]);

  // Pre-fill results.form con resultados existentes (BD) — método + penales
  // también si el partido ya estaba finalizado en la base.
  useEffect(() => {
    setResults(prev => {
      let changed = false;
      const next = { ...prev.form };
      matches.forEach(m => {
        const hasT1 = m.result_team1 !== undefined && m.result_team1 !== null;
        const hasT2 = m.result_team2 !== undefined && m.result_team2 !== null;
        const existing = next[m.id];
        if ((hasT1 || hasT2) && !existing) {
          next[m.id] = {
            team1: hasT1 ? String(m.result_team1) : '',
            team2: hasT2 ? String(m.result_team2) : '',
            resultMethod: m.result_method ?? null,
            penaltyTeam1: m.penalty_score_team1 != null ? String(m.penalty_score_team1) : '',
            penaltyTeam2: m.penalty_score_team2 != null ? String(m.penalty_score_team2) : '',
          };
          changed = true;
        }
      });
      return changed ? { ...prev, form: next } : prev;
    });
  }, [matches]);

  const {
    hasLockedMatches,
    createMatch,
    editMatch, deleteMatch,
    handleStatusChange, handlePublishResult, handleBatchPublish,
    suggestedToOpen,
  } = useMatchHandlers(matches, results, setResults, sourceState, setSourceState, liveNow);

  // Agrupar partidos por fecha
  const groupedMatches = React.useMemo(() => matches.reduce((acc, m) => {
    const date = m.match_date || 'sin-fecha';
    if (!acc[date]) acc[date] = [];
    acc[date].push(m);
    return acc;
  }, {}), [matches]);

  const sortedDates = React.useMemo(() => Object.keys(groupedMatches).toSorted(), [groupedMatches]);

  if (isLoading) return <p className="text-muted-foreground">Cargando panel de administración de partidos...</p>;

  return (
    <div className="space-y-4">
      <QuickActions
        hasLocked={hasLockedMatches}
        onDedupe={async () => {
          setSourceState(prev => ({ ...prev, deduping: true }));
          try {
            const result = await db.matches.deduplicate();
            if (result.deleted === 0) {
              toast.success('No se encontraron partidos duplicados ✅');
            } else {
              toast.success(`🧹 ${result.deleted} duplicados eliminados · ${result.repointed} predicciones re-asignadas`);
            }
            queryClient.invalidateQueries({ queryKey: ['admin-matches-sorted'] });
          } catch (e) {
            toast.error('Error al deduplicar: ' + e.message);
          } finally {
            setSourceState(prev => ({ ...prev, deduping: false }));
          }
        }}
        deduping={sourceState.deduping}
        matchCount={matches.length}
        onCreateMatch={(form) => createMatch.mutate(form)}
        creating={createMatch.isPending}
      />

      <BatchPublishCard
        matches={matches}
        results={results}
        setResults={setResults}
        onPublish={handleBatchPublish}
        liveResults={liveResults}
      />

      <StatusLegend />

      {/* FIX UX: banner de partidos 'pending' dentro de 24h que deberían
          abrirse para que los usuarios puedan pronosticar. Antes había que
          adivinar; ahora el admin ve 1 click para abrir cada uno. */}
      {suggestedToOpen.length > 0 && (
        <Card className="border-amber-400/50 bg-amber-50/50 dark:bg-amber-950/20">
          <CardContent className="p-3 space-y-2">
            <div className="flex items-center gap-2">
              <AlertCircle className="w-4 h-4 text-amber-600" />
              <p className="text-sm font-semibold text-amber-700 dark:text-amber-300">
                {suggestedToOpen.length} partido{suggestedToOpen.length > 1 ? 's' : ''} pendiente{suggestedToOpen.length > 1 ? 's' : ''} que deberí{suggestedToOpen.length > 1 ? 'an' : 'a'} abrirse (faltan &lt; 24h)
              </p>
            </div>
            <div className="flex flex-wrap gap-2">
              {suggestedToOpen.map(m => (
                <Button
                  key={m.id}
                  size="sm"
                  variant="outline"
                  className="gap-1.5 h-7 text-xs"
                  onClick={() => handleStatusChange(m, 'open')}
                >
                  <CheckCircle2 className="w-3 h-3" />
                  Abrir {m.team1} vs {m.team2} ({formatTime12h(m.match_time)})
                </Button>
              ))}
            </div>
          </CardContent>
        </Card>
      )}

      <MatchGroupList
        sortedDates={sortedDates}
        allMatches={matches}
        groupedMatches={groupedMatches}
        hasLockedMatches={hasLockedMatches}
        results={results}
        setResults={setResults}
        handleStatusChange={handleStatusChange}
        handlePublishResult={handlePublishResult}
        editMatch={editMatch}
        deleteMatch={deleteMatch}
        predictionCountByMatchId={predictionCountByMatchId}
        pendingConfirmIds={pendingConfirmIds}
        liveResults={liveResults}
      />
    </div>
  );
}
