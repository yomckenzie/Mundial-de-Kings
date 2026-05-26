import React, { useState, useEffect, useCallback } from 'react';
import { useOutletContext, Link } from 'react-router-dom';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { motion, AnimatePresence } from 'framer-motion';
import { api } from '@/api/client';
import { getSourceStatus, syncWithBestSource } from '@/api/dataSources';

import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import { Calendar, Clock, Lock, CheckCircle2, X, UserPlus, Send, Wifi, WifiOff, RefreshCw, UserCheck } from 'lucide-react';
import { format } from 'date-fns';
import { es } from 'date-fns/locale';
import { toast } from 'sonner';

const statusMap = {
  pending: { label: 'Próximamente', class: 'bg-muted text-muted-foreground' },
  open: { label: 'Abierto', class: 'bg-emerald-100 text-emerald-800 dark:bg-emerald-900/40 dark:text-emerald-300' },
  live: { label: 'EN VIVO', class: 'bg-red-600 text-white animate-pulse' },
  closed: { label: 'Cerrado', class: 'bg-secondary/50 text-secondary-foreground' },
  finished: { label: 'Finalizado', class: 'bg-muted text-muted-foreground' },
};

const getMatchDate = (match_date, match_time) => {
  // Soporta formato ISO (de Supabase) y formato simple yyyy-MM-dd
  if (!match_date || !match_time) return null;
  const datePart = match_date.split('T')[0];
  const [year, month, day] = datePart.split('-').map(Number);
  const [hour, minute] = match_time.split(':').map(Number);
  return new Date(year, month - 1, day, hour, minute, 0);
};

const getTimeUntilOpen = (match_date, match_time) => {
  const matchDateTime = getMatchDate(match_date, match_time);
  if (!matchDateTime) return null;
  const openFrom = new Date(matchDateTime.getTime() - 24 * 60 * 60 * 1000);
  const now = new Date();
  const diff = openFrom - now;
  if (diff <= 0) return null;
  const hours = Math.floor(diff / (1000 * 60 * 60));
  const minutes = Math.floor((diff % (1000 * 60 * 60)) / (1000 * 60));
  return hours > 0 ? `${hours}h ${minutes}m` : `${minutes}m`;
};

const isMatchOpenForPredictions = (match) => {
  if (match.status !== 'pending' && match.status !== 'open') return false;
  // Si el admin lo puso como 'open', se habilita manualmente sin importar la ventana de 24h
  if (match.status === 'open') return true;
  const matchDateTime = getMatchDate(match.match_date, match.match_time);
  if (!matchDateTime) return false;
  const openFrom = new Date(matchDateTime.getTime() - 24 * 60 * 60 * 1000);
  const now = new Date();
  return now >= openFrom && now < matchDateTime;
};

function MatchCard({ match, user, existing, predictions, submitPrediction, handlePredict }) {
  const isOpen = isMatchOpenForPredictions(match);
  const st = isOpen ? statusMap.open : (statusMap[match.status] || statusMap.pending);
  const isLive = match.status === 'live';

  return (
    <motion.div
      layout
      initial={{ opacity: 0, y: 16 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, scale: 0.95 }}
      transition={{ duration: 0.3, ease: 'easeOut' }}
    >
      <Card className={`card-hover ${isLive ? 'ring-2 ring-red-500/50 glow-sm' : ''}`}>
        <CardContent className="p-4 md:p-5">
          {/* Date & Status */}
          <div className="flex items-center justify-between mb-3">
            <div className="flex items-center gap-2 text-sm text-muted-foreground">
              <Calendar className="w-4 h-4" />
              {match.match_date && (() => { const d = new Date(match.match_date); return isNaN(d.getTime()) ? match.match_date : format(d, "d 'de' MMMM", { locale: es }); })()}
              <Clock className="w-4 h-4 ml-1" />
              {match.match_time}
            </div>
            <Badge className={`${st.class} border-0`}>
              {isLive ? (match.elapsed ? `${match.elapsed}'` : 'EN VIVO') : st.label}
            </Badge>
          </div>

          {match.group_stage && (
            <p className="text-xs text-muted-foreground mb-2 uppercase tracking-wider font-medium">{match.group_stage}</p>
          )}

          {/* Teams & Score */}
          <div className="flex items-center justify-center gap-3 md:gap-6 py-4">
            <span className="font-bold text-base md:text-lg text-right flex-1">{match.team1}</span>

            {match.status === 'finished' || isLive ? (
              <motion.div
                className={`font-bold px-5 py-2.5 rounded-xl text-lg min-w-[90px] text-center ${
                  isLive ? 'bg-red-600 text-white' : 'bg-primary text-primary-foreground'
                }`}
                initial={isLive ? { scale: 1 } : undefined}
                animate={isLive ? { scale: [1, 1.03, 1] } : undefined}
                transition={isLive ? { repeat: Infinity, duration: 2 } : undefined}
              >
                {(match.result_team1 ?? match.result_team1 === 0) ? match.result_team1 : '-'}
                {' - '}
                {(match.result_team2 ?? match.result_team2 === 0) ? match.result_team2 : '-'}
              </motion.div>
            ) : (
              <div className="px-5 py-2.5 rounded-xl bg-muted/50">
                <span className="text-muted-foreground font-bold text-lg">VS</span>
              </div>
            )}

            <span className="font-bold text-base md:text-lg text-left flex-1">{match.team2}</span>
          </div>

          {/* Status / Prediction area */}
          {isLive ? (
            <div className="mt-3 text-center text-sm text-muted-foreground flex items-center justify-center gap-1.5 py-2 bg-red-50 dark:bg-red-950/20 rounded-lg">
              <span className="w-2 h-2 rounded-full bg-red-500 animate-pulse" />
              Partido en curso — pronósticos cerrados
            </div>
          ) : match.status === 'finished' ? (
            <div className="mt-3 text-center text-sm text-muted-foreground flex items-center justify-center gap-1.5 py-2 bg-muted/30 rounded-lg">
              <Lock className="w-4 h-4" />
              Partido finalizado
            </div>
          ) : match.status === 'pending' && !isOpen ? (
            <div className="mt-3 text-center text-sm text-muted-foreground flex items-center justify-center gap-1.5 py-2 bg-muted/30 rounded-lg">
              <Clock className="w-4 h-4" />
              {(() => {
                const t = getTimeUntilOpen(match.match_date, match.match_time);
                return t ? `Pronósticos abren en ${t}` : 'Pronósticos abriendo pronto...';
              })()}
            </div>
          ) : !user && isOpen ? (
            <div className="mt-3 text-center">
              <Link to="/register">
                <Button size="sm" variant="outline" className="gap-2">
                  <UserPlus className="w-4 h-4" />
                  Regístrate para pronosticar
                </Button>
              </Link>
            </div>
          ) : existing ? (
            <motion.div
              className="mt-3 p-3 rounded-xl bg-muted/50 text-center text-sm"
              initial={{ opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
            >
              <p className="text-muted-foreground mb-1">Tu pronóstico:</p>
              <p className="font-bold text-foreground text-base">
                {match.team1} {existing.pred_team1} - {existing.pred_team2} {match.team2}
              </p>
              {existing.scored && (
                <motion.div
                  className={`mt-2 flex items-center justify-center gap-1.5 ${existing.is_correct ? 'text-foreground' : 'text-destructive'}`}
                  initial={{ opacity: 0, scale: 0.9 }}
                  animate={{ opacity: 1, scale: 1 }}
                >
                  {existing.is_correct ? (
                    <><CheckCircle2 className="w-4 h-4" /> ¡Acertaste! +100 pts</>
                  ) : (
                    <><X className="w-4 h-4" /> No acertaste</>
                  )}
                </motion.div>
              )}
            </motion.div>
          ) : isOpen ? (
            <motion.div
              className="mt-3 flex items-center justify-center gap-3"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
            >
              <Input
                type="number"
                min="0"
                className="w-16 text-center"
                placeholder="0"
                value={predictions[match.id]?.team1 ?? ''}
                onChange={(e) => handlePredict(match.id, 'team1', e.target.value)}
              />
              <span className="text-muted-foreground font-bold">-</span>
              <Input
                type="number"
                min="0"
                className="w-16 text-center"
                placeholder="0"
                value={predictions[match.id]?.team2 ?? ''}
                onChange={(e) => handlePredict(match.id, 'team2', e.target.value)}
              />
              <Button
                size="sm"
                onClick={() => submitPrediction({
                  match_id: match.id,
                  user_email: user.email,
                  pred_team1: Number(predictions[match.id]?.team1),
                  pred_team2: Number(predictions[match.id]?.team2),
                })}
                disabled={submitPrediction.isPending}
                className="gap-1.5"
              >
                <Send className="w-3.5 h-3.5" />
                Enviar
              </Button>
            </motion.div>
          ) : (
            <div className="mt-3 text-center text-sm text-muted-foreground flex items-center justify-center gap-1.5 py-2 bg-muted/30 rounded-lg">
              <Lock className="w-4 h-4" />
              Pronósticos cerrados
            </div>
          )}
        </CardContent>
      </Card>
    </motion.div>
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

export default function Matches() {
  const { user } = useOutletContext();
  const queryClient = useQueryClient();
  const [predictionsState, setPredictionsState] = useState({});

  const { data: rawMatches = [], isLoading } = useQuery({
    queryKey: ['matches'],
    queryFn: () => api.entities.Match.list(),
  });

  const matches = React.useMemo(() =>
    [...rawMatches].sort((a, b) => {
      if (a.match_date !== b.match_date) return a.match_date?.localeCompare(b.match_date);
      return (a.match_time || '').localeCompare(b.match_time || '');
    }), [rawMatches]);

  const { data: userPredictions = [] } = useQuery({
    queryKey: ['my-predictions', user?.email],
    queryFn: () => user ? api.entities.Prediction.filter({ user_email: user.email }) : Promise.resolve([]),
    enabled: !!user,
  });

  // ─── Estado de fuentes de datos ───
  const [sourceStatus, setSourceStatus] = useState(null);
  const [sourcesChecked, setSourcesChecked] = useState(false);
  const [syncing, setSyncing] = useState(false);

  // Verificar fuentes al montar
  useEffect(() => {
    getSourceStatus().then(status => {
      setSourceStatus(status);
      setSourcesChecked(true);
    });
  }, []);

  // Auto-sync cada 20 minutos
  const doSync = useCallback(async () => {
    setSyncing(true);
    try {
      const result = await syncWithBestSource();
      // Actualizar status de fuentes
      const status = await getSourceStatus();
      setSourceStatus(status);
      if (result.synced > 0 || result.updated > 0) {
        queryClient.invalidateQueries({ queryKey: ['matches'] });
      }
    } finally {
      setSyncing(false);
    }
  }, [queryClient]);

  // Auto-sync cada 20 minutos (solo si hay fuente automática)
  useEffect(() => {
    if (!sourceStatus?.hasAutoSync) return;
    doSync();
    const interval = setInterval(doSync, 20 * 60 * 1000);
    return () => clearInterval(interval);
  }, [sourceStatus?.hasAutoSync, doSync]);

  // Refresh local cada 30s para ver cambios en DB
  useEffect(() => {
    const interval = setInterval(() => {
      queryClient.invalidateQueries({ queryKey: ['matches'] });
    }, 30000);
    return () => clearInterval(interval);
  }, [queryClient]);

  const submitPrediction = useMutation({
    mutationFn: (data) => api.entities.Prediction.create(data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['my-predictions'] });
      toast.success('¡Pronóstico enviado!');
    },
    onError: (err) => toast.error(err?.message || 'Error al enviar pronóstico'),
  });

  const getPredictionForMatch = (matchId) =>
    userPredictions.find(p => p.match_id === matchId);

  const handlePredict = (matchId, team, value) => {
    setPredictionsState(prev => ({
      ...prev,
      [matchId]: { ...prev[matchId], [team]: value }
    }));
  };

  const handleSubmit = (data) => {
    const pred = predictionsState[data.match_id];
    if (pred?.team1 === undefined || pred?.team2 === undefined || pred.team1 === '' || pred.team2 === '') {
      toast.error('Ingresa el marcador para ambos equipos');
      return;
    }
    submitPrediction.mutate(data);
  };

  const isWithin24h = (match) => {
    // Si el admin lo abrió manualmente, se muestra siempre
    if (match.status === 'open') return true;
    const matchDateTime = getMatchDate(match.match_date, match.match_time);
    if (!matchDateTime) return false;
    const openFrom = new Date(matchDateTime.getTime() - 24 * 60 * 60 * 1000);
    const now = new Date();
    return now >= openFrom && now < matchDateTime;
  };

  const liveMatches = matches.filter(m => m.status === 'live');
  const upcomingMatches = matches.filter(m => (m.status === 'pending' || m.status === 'open') && isWithin24h(m))
    .sort((a, b) => {
      if (a.status === 'open' && b.status !== 'open') return -1;
      if (a.status !== 'open' && b.status === 'open') return 1;
      if (a.match_date !== b.match_date) return a.match_date?.localeCompare(b.match_date);
      return (a.match_time || '').localeCompare(b.match_time || '');
    });
  const finishedMatches = matches.filter(m => m.status === 'finished' || m.status === 'closed');

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
    <motion.div
      className="space-y-6"
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      transition={{ duration: 0.3 }}
    >
      <div className="flex items-center justify-between">
        <h1 className="font-display text-4xl tracking-wide">PARTIDOS</h1>
        {sourcesChecked && (
          <div className="flex items-center gap-3">
            {syncing && (
              <span className="text-xs text-muted-foreground flex items-center gap-1">
                <RefreshCw className="w-3 h-3 animate-spin" />
                Sincronizando...
              </span>
            )}
            <div className={`flex items-center gap-1.5 text-xs px-3 py-1.5 rounded-full ${
              sourceStatus?.hasAutoSync && sourceStatus?.connected
                ? 'bg-muted text-foreground'
                : sourceStatus?.hasAutoSync
                  ? 'bg-muted text-muted-foreground'
                  : 'bg-muted text-muted-foreground'
            }`}>
              {sourceStatus?.hasAutoSync && sourceStatus?.connected ? (
                <><Wifi className="w-3 h-3" /> {sourceStatus.bestSourceName}</>
              ) : sourceStatus?.hasAutoSync ? (
                <><WifiOff className="w-3 h-3" /> Sin conexión</>
              ) : (
                <><UserCheck className="w-3 h-3" /> Manual</>
              )}
            </div>
          </div>
        )}
      </div>

      {sourceStatus?.lastSync && sourceStatus?.connected && (
        <p className="text-xs text-muted-foreground/60 text-right -mt-4">
          Última sincronización: {(() => { if (!sourceStatus?.lastSync?.time) return '—'; const d = new Date(sourceStatus.lastSync.time); return isNaN(d.getTime()) ? '—' : d.toLocaleTimeString(); })()}
          {sourceStatus.lastSync.updated > 0 && ` · ${sourceStatus.lastSync.updated} actualizados`}
        </p>
      )}

      {matches.length === 0 && (
        <motion.div
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
        </motion.div>
      )}

      {/* Live Matches */}
      <AnimatePresence mode="popLayout">
        {liveMatches.length > 0 && (
          <motion.div
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
                />
              ))}
            </div>
          </motion.div>
        )}

        {/* Upcoming Matches */}
        {upcomingMatches.length > 0 && (
          <motion.div
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
                />
              ))}
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Finished Matches */}
      {finishedMatches.length > 0 && (
        <div>
          <details className="group">
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
                  />
                ))}
              </AnimatePresence>
            </div>
          </details>
        </div>
      )}
    </motion.div>
  );
}
