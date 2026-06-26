import React, { useState, useEffect } from 'react';
import { useOutletContext, Link, useSearchParams } from 'react-router-dom';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { m, AnimatePresence } from 'framer-motion';
import { api } from '@/api/client';
import { Card, CardContent } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import { Calendar } from 'lucide-react';
import { toast } from 'sonner';
import { useLiveResults } from './matches/useLiveResults';
import { isLiveMatch as isLiveByTime } from './matches/matchTiming';
import {
  MatchCard,
  EMPTY_FORM,
  getMatchDate,
  isWithinVisibilityWindow,
} from './matches/MatchCard';

// Task 6: predicción 3 pasos (ganador + método + penales).
// Hasta 150 pts si aciertas los 3.

// v2 (metodología 3 picks con marcador exacto) se activa a partir de esta
// fecha en PRODUCCIÓN. Antes de eso los partidos usan el formato legacy
// (1 solo pick: marcador exacto, 100 pts si aciertas).
//
// Override en localhost: cuando se corre `npm run dev`, Vite expone
// `import.meta.env.DEV === true` y forzamos v2 para TODOS los partidos
// (sin importar la fecha) así podemos testear el flujo nuevo en localhost
// sin tener que esperar al 28 jun ni riesgo de filtrarse a producción
// (DEV es false en el build servido, así que producción sigue respetando
// la fecha).
const V2_ACTIVATION_DATE = '2026-06-28';
const isLocalhost = import.meta.env.DEV;
const isV2Match = (m) => {
  if (isLocalhost) return true; // preview libre en dev
  return !!m?.match_date && m.match_date >= V2_ACTIVATION_DATE;
};

export default function Matches() {
  const { user } = useOutletContext();
  const queryClient = useQueryClient();
  const [predictionsState, setPredictionsState] = useState({});
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
  // Admin: ve todo (matches.is_test === true o false). Público: solo !is_test,
  // a menos que la URL tenga ?include_test=1 (override local de testing).
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

  const submitPrediction = useMutation({
    mutationFn: (data) => api.entities.Prediction.create(data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['my-predictions', user?.email] });
      setPredictionsState(prev => {
        // Limpiar estado local para que muestre la predicción guardada
        const next = { ...prev };
        delete next[Object.keys(prev).find(k => prev[k]?.submitted)];
        return next;
      });
      toast.success('¡Pronóstico enviado! 🏆');
    },
    onError: (err) => toast.error(err?.message || 'Error al enviar pronóstico'),
  });

  const getPredictionForMatch = (matchId) =>
    userPredictions.find(p => p.match_id === matchId);

  // Task 6: ahora guarda {pred_winner, pred_method, pred_penalty_team1/2}.
  // Merge con EMPTY_FORM para que el primer cambio no sobrescriba los demás campos.
  const handlePredict = (matchId, field, value) => {
    setPredictionsState(prev => ({
      ...prev,
      [matchId]: { ...EMPTY_FORM, ...(prev[matchId] || {}), [field]: value },
    }));
  };

  // Branch v1/v2 por fecha del partido:
  //   match_date >= '2026-06-28' → payload v2 (3 picks: ganador/método/marcador)
  //   match_date <  '2026-06-28' → payload v1 legacy (sólo marcador: pred_team1/pred_team2)
  // El backend (evaluateMatchPredictions.js) detecta v2 por presencia de pred_method
  // y rutea a scoreV2; si no, usa la rama legacy. Score fields v2 se mandan como null
  // para partidos viejos así no se contaminan las columnas nuevas.
  const handleSubmit = (data) => {
    const match = matches.find(m => m.id === data.match_id);
    const form = predictionsState[data.match_id] || {};
    const v2 = isV2Match(match);

    if (!v2) {
      // ─── LEGACY v1 (pre-28 jun): sólo marcador, 100 pts si aciertas ───
      const t1 = form.team1 ?? predictionsState[data.match_id]?.team1;
      const t2 = form.team2 ?? predictionsState[data.match_id]?.team2;
      if (t1 === '' || t1 === undefined || t2 === '' || t2 === undefined) {
        toast.error('Completa el marcador (0-0 cuenta como predicción)');
        return;
      }
      submitPrediction.mutate({
        match_id: data.match_id,
        user_email: data.user_email,
        pred_team1: Number(t1),
        pred_team2: Number(t2),
      });
      return;
    }

    // ─── v2 (>= 28 jun): 3 picks independientes ───
    if (!form.pred_winner) {
      toast.error('Elige quién gana');
      return;
    }
    if (!form.pred_method) {
      toast.error('Elige cómo gana');
      return;
    }
    if (form.pred_method === '90' || form.pred_method === 'et') {
      if (form.pred_score_team1 === '' || form.pred_score_team2 === '') {
        toast.error('Completa el marcador exacto (0-0 cuenta como predicción)');
        return;
      }
    }
    if (form.pred_method === 'pen') {
      if (form.pred_score_team1 === '' || form.pred_score_team2 === '') {
        toast.error('Completa el marcador final (suma 90 + ET + penales, 0-0 cuenta como predicción)');
        return;
      }
    }
    submitPrediction.mutate({
      match_id: data.match_id,
      user_email: data.user_email,
      // Mapear 'team1'/'team2' → '1'/'2' para compatibilidad con deriveWinner/scoreV2
      pred_winner: form.pred_winner === 'team1' ? '1' : '2',
      pred_method: form.pred_method,
      pred_score_team1: form.pred_score_team1 === '' ? null : Number(form.pred_score_team1),
      pred_score_team2: form.pred_score_team2 === '' ? null : Number(form.pred_score_team2),
      // v2 pen simplificado: un solo input suma 90+ET+pens. pred_pen_* quedan null.
      pred_pen_team1: null,
      pred_pen_team2: null,
    });
  };

  // Resultados en vivo de SportScore (auto-refresco cada 30s), { matchId → liveResult }
  const liveResults = useLiveResults(matches);

  // Partidos que SportScore reporta como finalizados pero que el admin AÚN no
  // ha publicado en la BD. Override visual: salen de EN VIVO y entran a
  // FINALIZADOS con etiqueta "Por confirmar" (sin veredicto del pronóstico).
  const pendingConfirmIds = new Set(
    matches
      .filter(m => liveResults[m.id]?.state === 'finished' && m.status !== 'finished')
      .map(m => m.id)
  );

  // EN VIVO = 'live' en la BD, o (open/closed/pending) cuyo horario de inicio ya
  // pasó (ver isLiveByTime). Incluir 'pending' es la red de seguridad: entre
  // ticks del cron (máx 5 min) un partido recién empezado se muestra acá en vez
  // de desaparecer. Se excluye lo ya finalizado/por-confirmar.
  const liveMatches = matches.filter(m =>
    !pendingConfirmIds.has(m.id) && isLiveByTime(m)
  );
  const liveIds = new Set(liveMatches.map(m => m.id));

  // PRÓXIMOS = pendientes/abiertos visibles cuyo horario de inicio AÚN no
  // llegó (now < kickoff). Si ya empezó, pasa a EN VIVO (liveIds).
  const notStartedYet = (m) => {
    const kickoff = getMatchDate(m.match_date, m.match_time);
    return kickoff ? Date.now() < kickoff.getTime() : true;
  };
  const upcomingMatches = matches
    .filter(m => (m.status === 'pending' || m.status === 'open') && isWithinVisibilityWindow(m) && !liveIds.has(m.id) && notStartedYet(m))
    .sort((a, b) => {
      if (a.status === 'open' && b.status !== 'open') return -1;
      if (a.status !== 'open' && b.status === 'open') return 1;
      if (a.match_date !== b.match_date) return a.match_date?.localeCompare(b.match_date);
      return (a.match_time || '').localeCompare(b.match_time || '');
    });
  // FIX UX: separar 'closed' (sin resultado publicado) de 'finished' (con
  // resultado y scoring). Antes aparecían juntos y era confuso. Ahora
  // closed tiene su propia categoría "CERRADOS SIN RESULTADO".
  const dbFinishedMatches = matches.filter(m => m.status === 'finished');
  const pendingConfirmMatches = matches.filter(m => pendingConfirmIds.has(m.id));
  const finishedMatches = [...pendingConfirmMatches, ...dbFinishedMatches];
  const closedMatches = matches.filter(m => m.status === 'closed' && !liveIds.has(m.id) && !pendingConfirmIds.has(m.id));

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
          de prueba (es admin O pidió ?include_test=1). Avisa que estos partidos
          NO son visibles al público. */}
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

      {/* Live Matches */}
      <AnimatePresence mode="popLayout">
        {liveMatches.length > 0 && (
          <m.div
            key="live"
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
          >
            <h2 className="font-display text-2xl tracking-wide text-red-600 mb-3 flex items-center gap-2">
              <span className="w-2 h-2 rounded-full bg-red-600 animate-pulse" />
              EN VIVO
            </h2>
            <div className="space-y-4">
              {liveMatches.map(match => (
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
                  live
                  isV2={isV2Match(match)}
                />
              ))}
            </div>
          </m.div>
        )}

        {/* Upcoming Matches */}
        {upcomingMatches.length > 0 && (
          <m.div
            key="upcoming"
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
          >
            <h2 className="font-display text-2xl tracking-wide mb-3">PRÓXIMOS PARTIDOS</h2>
            <div className="space-y-4">
{upcomingMatches.map(match => (
                <MatchCard
                  key={match.id}
                  match={match}
                  user={user}
                  existing={getPredictionForMatch(match.id)}
                  predictions={predictionsState}
                  submitPrediction={submitPrediction}
                  handlePredict={handlePredict}
                  handleSubmit={handleSubmit}
                  isV2={isV2Match(match)}
                />
              ))}
            </div>
          </m.div>
        )}
      </AnimatePresence>

      {/* Finished Matches */}
      {finishedMatches.length > 0 && (
        <div>
          <details className="group" open={pendingConfirmMatches.length > 0}>
            <summary className="font-display text-2xl tracking-wide mb-3 cursor-pointer hover:text-secondary transition flex items-center gap-2">
              FINALIZADOS
              <span className="text-sm font-sans font-normal text-muted-foreground">({finishedMatches.length})</span>
            </summary>
            <div className="space-y-4 mt-4">
              <AnimatePresence>
                {finishedMatches.map(match => (
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
                    pendingConfirm={pendingConfirmIds.has(match.id)}
                    isV2={isV2Match(match)}
                  />
                ))}
              </AnimatePresence>
            </div>
          </details>
        </div>
      )}

      {/* Closed Matches (sin resultado publicado) */}
      {closedMatches.length > 0 && (
        <div>
          <details className="group">
            <summary className="font-display text-2xl tracking-wide mb-3 cursor-pointer hover:text-secondary transition flex items-center gap-2 text-muted-foreground">
              CERRADOS SIN RESULTADO
              <span className="text-sm font-sans font-normal text-muted-foreground">({closedMatches.length})</span>
            </summary>
            <div className="space-y-4 mt-4">
              <AnimatePresence>
                {closedMatches.map(match => (
                  <MatchCard
                    key={match.id}
                    match={match}
                    user={user}
                    existing={getPredictionForMatch(match.id)}
                    predictions={predictionsState}
                    submitPrediction={submitPrediction}
                    handlePredict={handlePredict}
                    handleSubmit={handleSubmit}
                    isV2={isV2Match(match)}
                  />
                ))}
              </AnimatePresence>
            </div>
          </details>
        </div>
      )}
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