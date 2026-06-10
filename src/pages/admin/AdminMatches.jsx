import React, { useState, useEffect } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { api } from '@/api/client';
import { db } from '@/lib/db';
import { toast } from 'sonner';
import DataSourcePanel from './DataSourcePanel';
import BatchPublishCard from './BatchPublishCard';
import QuickActions from './QuickActions';
import StatusLegend from './StatusLegend';
import MatchGroupList from './MatchGroupList';
import useMatchHandlers from './useMatchHandlers';



export default function AdminMatches() {
  const queryClient = useQueryClient();
  const [results, setResults] = useState({ form: {}, bulk: {} });
  const [liveNow, setLiveNow] = useState(() => Date.now());
  const [sourceState, setSourceState] = useState({ syncing: false, sources: [], show: true, deduping: false });
  const sourcesLoading = sourceState.sources.length === 0;

  // Timer en tiempo real para calcular elapsed desde live_started_at
  useEffect(() => {
    const interval = setInterval(() => setLiveNow(Date.now()), 10000);
    return () => clearInterval(interval);
  }, []);

  // ── Datos de partidos ──
  const { data: rawMatches = [], isLoading } = useQuery({
    queryKey: ['admin-matches-sorted'],
    queryFn: () => api.entities.Match.list(),
  });

  const matches = React.useMemo(() =>
    rawMatches.toSorted((a, b) => {
      if (a.match_date !== b.match_date) return a.match_date?.localeCompare(b.match_date);
      return (a.match_time || '').localeCompare(b.match_time || '');
    }), [rawMatches]);

  // Pre-fill results.form con resultados existentes
  useEffect(() => {
    setResults(prev => {
      let changed = false;
      const next = { ...prev.form };
      matches.forEach(m => {
        const hasT1 = m.result_team1 !== undefined && m.result_team1 !== null;
        const hasT2 = m.result_team2 !== undefined && m.result_team2 !== null;
        if ((hasT1 || hasT2) && !next[m.id]) {
          next[m.id] = {
            team1: hasT1 ? String(m.result_team1) : '',
            team2: hasT2 ? String(m.result_team2) : '',
          };
          changed = true;
        }
      });
      return changed ? { ...prev, form: next } : prev;
    });
  }, [matches]);

  const {
    handleSyncNow, refreshSources, hasLockedMatches,
    resetAllMatches, seedMutation, handleClearAll, createMatch,
    handleStatusChange, handlePublishResult, handleBatchPublish,
  } = useMatchHandlers(matches, results, setResults, sourceState, setSourceState, liveNow);

  // Cargar fuentes al montar
  useEffect(() => {
    refreshSources();
  }, [refreshSources]);

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
      <DataSourcePanel
        sources={sourceState.sources}
        sourcesLoading={sourcesLoading}
        syncing={sourceState.syncing}
        show={sourceState.show}
        onToggle={() => setSourceState(prev => ({ ...prev, show: !prev.show }))}
        onSync={handleSyncNow}
        onRefresh={refreshSources}
      />

      <QuickActions
        onSeed={() => seedMutation.mutate()}
        seeding={seedMutation.isPending}
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
        onClear={handleClearAll}
        clearing={resetAllMatches.isPending}
        onCreateMatch={(form) => createMatch.mutate(form)}
        creating={createMatch.isPending}
      />

      <BatchPublishCard
        matches={matches}
        results={results}
        setResults={setResults}
        onPublish={handleBatchPublish}
      />

      <StatusLegend />

      <MatchGroupList
        sortedDates={sortedDates}
        groupedMatches={groupedMatches}
        hasLockedMatches={hasLockedMatches}
        liveNow={liveNow}
        results={results}
        setResults={setResults}
        handleStatusChange={handleStatusChange}
        handlePublishResult={handlePublishResult}
      />
    </div>
  );
}
