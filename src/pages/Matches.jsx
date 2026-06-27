import React, { useEffect } from 'react';
import { useOutletContext, Link, useSearchParams } from 'react-router-dom';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { m } from 'framer-motion';
import { api } from '@/api/client';
import { Card, CardContent } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import { Calendar } from 'lucide-react';
import { useLiveResults } from './matches/useLiveResults';
import { MatchCard } from './matches/MatchCard';
import {
  LiveMatchesSection,
  UpcomingMatchesSection,
  FinishedMatchesSection,
  ClosedMatchesSection,
} from './matches/MatchesSections';
import { usePredictionSubmit } from './matches/usePredictionSubmit';
import { useCategorizedMatches } from './matches/useCategorizedMatches';
import { isV2Match } from './matches/usePredictionSubmit';

export default function Matches() {
  const { user } = useOutletContext();
  const queryClient = useQueryClient();
  const [searchParams, setSearchParams] = useSearchParams();

  // Test mode: partidos con is_test=true son LOCAL ONLY (no se muestran al
  // público en producción). Para que vos los veas en localhost, abrí
  // /matches?include_test=1. El admin los ve siempre sin importar la URL.
  const includeTestFromUrl = searchParams.get('include_test') === '1';
  const showTestMatches = user?.role === 'admin' || includeTestFromUrl;

  const { data: rawMatches = [], isLoading } = useQuery({
    queryKey: ['matches'],
    queryFn: () => api.entities.Match.list(),
  });

  // Filtrar partidos de prueba para usuarios no-admin en producción.
  // Admin: ve todo. Público: solo !is_test, a menos que la URL tenga
  // ?include_test=1 (override local de testing).
  const matches = React.useMemo(() => {
    const filtered = showTestMatches
      ? rawMatches
      : rawMatches.filter(m => !m.is_test);
    return filtered.toSorted((a, b) => {
      if (a.match_date !== b.match_date) return a.match_date?.localeCompare(b.match_date);
      return (a.match_time || '').localeCompare(b.match_time || '');
    });
  }, [rawMatches, showTestMatches]);

  const { data: userPredictions = [] } = useQuery({
    queryKey: ['my-predictions', user?.email],
    queryFn: () => user ? api.entities.Prediction.filter({ user_email: user.email }) : Promise.resolve([]),
    enabled: !!user,
  });

  // Refresh local cada 15s para ver cambios en DB (scoring, badges, etc.)
  useEffect(() => {
    const refresh = () => {
      queryClient.invalidateQueries({ queryKey: ['matches'] });
      queryClient.invalidateQueries({
        predicate: (q) => Array.isArray(q.queryKey) && q.queryKey[0]?.startsWith('my-predictions')
      });
    };
    // Refrescar al volver a la pestaña (visibilitychange)
    const onVisibility = () => { if (!document.hidden) refresh(); };
    document.addEventListener('visibilitychange', onVisibility);
    return () => {
      document.removeEventListener('visibilitychange', onVisibility);
    };
  }, [queryClient]);

  const {
    predictionsState,
    handlePredict,
    handleSubmit,
    submitPrediction,
  } = usePredictionSubmit({ user, matches });

  // Resultados en vivo de SportScore (auto-refresco cada 30s).
  const liveResults = useLiveResults(matches);

  const {
    liveMatches,
    upcomingMatches,
    finishedMatches,
    pendingConfirmMatches,
    closedMatches,
    pendingConfirmIds,
  } = useCategorizedMatches(matches, liveResults);

  const getPredictionForMatch = (matchId) =>
    userPredictions.find(p => p.match_id === matchId);

  // Builder de MatchCard usado por todas las secciones para mantener
  // los props idénticos y centralizar la lógica de `live`/`pendingConfirm`.
  const renderMatchCard = (match, { live = false, finished = false } = {}) => (
    <MatchCard
      key={match.id}
      match={match}
      user={user}
      existing={getPredictionForMatch(match.id)}
      predictions={predictionsState}
      submitPrediction={submitPrediction}
      handlePredict={handlePredict}
      handleSubmit={handleSubmit}
      liveResult={liveResults[match.id]}
      live={live}
      pendingConfirm={finished && pendingConfirmIds.has(match.id)}
      isV2={isV2Match(match)}
    />
  );

  if (isLoading) {
    return (
      <div className="space-y-6">
        <Skeleton className="h-10 w-48" />
        <div className="space-y-4">
          {[1, 2, 3].map(i => <MatchSkeleton key={i} />)}
        </div>
      </div>
    );
  }

  return (
    <m.div
      className="space-y-6"
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      transition={{ duration: 0.3 }}
    >
      <div className="flex items-center justify-between">
        <h1 className="font-display text-4xl tracking-wide">PARTIDOS</h1>
      </div>

      {/* Banner de modo test: solo visible si el usuario está viendo partidos
          de prueba (es admin O pidió ?include_test=1). */}
      {showTestMatches && (rawMatches || []).some(m => m.is_test) && (
        <div className="rounded-md border border-amber-400/60 bg-amber-50 dark:bg-amber-950/30 px-3 py-2 text-xs flex items-center justify-between gap-3">
          <span className="text-amber-700 dark:text-amber-300">
            🧪 <strong>Modo prueba activo</strong>: estás viendo partidos de testing
            que NO se muestran al público en producción.
          </span>
          {!includeTestFromUrl && user?.role === 'admin' && (
            <button
              type="button"
              onClick={() => setSearchParams({})}
              className="text-amber-700 dark:text-amber-300 underline hover:no-underline shrink-0"
            >
              Ocultar partidos de prueba
            </button>
          )}
        </div>
      )}

      {matches.length === 0 && (
        <m.div
          className="text-center py-16 space-y-3"
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
        >
          <Calendar className="w-12 h-12 text-muted-foreground/30 mx-auto" />
          <p className="text-muted-foreground">
            No hay partidos disponibles.
          </p>
          {user?.role === 'admin' && (
            <p className="text-sm text-muted-foreground/70">
              Ve al panel{' '}
              <Link to="/admin/matches" className="underline hover:text-foreground transition">Admin → Partidos</Link>
              {' '}para crear partidos manualmente.
            </p>
          )}
        </m.div>
      )}

      <LiveMatchesSection
        liveMatches={liveMatches}
        renderCard={renderMatchCard}
      />
      <UpcomingMatchesSection
        upcomingMatches={upcomingMatches}
        renderCard={renderMatchCard}
      />
      <FinishedMatchesSection
        finishedMatches={finishedMatches}
        pendingConfirmMatches={pendingConfirmMatches}
        renderCard={renderMatchCard}
      />
      <ClosedMatchesSection
        closedMatches={closedMatches}
        renderCard={renderMatchCard}
      />
    </m.div>
  );
}

function MatchSkeleton() {
  return (
    <Card>
      <CardContent className="p-4 md:p-5 space-y-4">
        <div className="flex items-center justify-between">
          <Skeleton className="h-4 w-40" />
          <Skeleton className="h-5 w-24 rounded-full" />
        </div>
        <div className="flex items-center justify-center gap-6 py-4">
          <Skeleton className="h-6 w-28" />
          <Skeleton className="h-10 w-20 rounded-xl" />
          <Skeleton className="h-6 w-28" />
        </div>
        <Skeleton className="h-10 w-full rounded-lg" />
      </CardContent>
    </Card>
  );
}