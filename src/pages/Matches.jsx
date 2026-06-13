import React, { useState, useEffect } from 'react';
import { useOutletContext, Link } from 'react-router-dom';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { m, AnimatePresence } from 'framer-motion';
import { api } from '@/api/client';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import { Calendar, Clock, Lock, CheckCircle2, X, UserPlus, Send, Trophy } from 'lucide-react';
import TeamFlag from '@/components/TeamFlag';
import { format, parse } from 'date-fns';
import { es } from 'date-fns/locale';
import { toast } from 'sonner';
import { formatTime12h } from '@/lib/utils';
import { useLiveResults } from './matches/useLiveResults';
import { isLiveMatch as isLiveByTime } from './matches/matchTiming';

// Referencia fija para parsear fechas en hora LOCAL (igual que el panel admin
// en MatchGroupList.jsx). Evita el desfase de zona horaria que ocurre al usar
// new Date('yyyy-MM-dd'), que interpreta la fecha como UTC y resta el offset
// local (mostrando un día antes en zonas UTC negativas como Panamá, UTC-5).
const PARSE_REF = new Date(0);

const formatMatchDate = (dateStr) => {
  if (!dateStr) return '';
  // Tomar solo la parte de fecha por si viene un timestamp ISO de Supabase
  const datePart = String(dateStr).split('T')[0];
  const d = parse(datePart, 'yyyy-MM-dd', PARSE_REF);
  if (isNaN(d.getTime())) return dateStr;
  return format(d, "d 'de' MMMM", { locale: es });
};

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

const VISIBILITY_WINDOW_HOURS = 48; // Partido aparece en la lista
const PREDICTION_WINDOW_HOURS = 24; // Usuario puede enviar pronóstico

const getTimeUntilOpen = (match_date, match_time) => {
  const matchDateTime = getMatchDate(match_date, match_time);
  if (!matchDateTime) return null;
  const openFrom = new Date(matchDateTime.getTime() - PREDICTION_WINDOW_HOURS * 60 * 60 * 1000);
  const now = new Date();
  const diff = openFrom - now;
  if (diff <= 0) return null;
  const hours = Math.floor(diff / (1000 * 60 * 60));
  const minutes = Math.floor((diff % (1000 * 60 * 60)) / (1000 * 60));
  return hours > 0 ? `${hours}h ${minutes}m` : `${minutes}m`;
};

const isWithinVisibilityWindow = (match) => {
  // Si el admin lo abrió manualmente, se muestra siempre
  if (match.status === 'open') return true;
  const matchDateTime = getMatchDate(match.match_date, match.match_time);
  if (!matchDateTime) return false;
  const visibleFrom = new Date(matchDateTime.getTime() - VISIBILITY_WINDOW_HOURS * 60 * 60 * 1000);
  const now = new Date();
  return now >= visibleFrom && now < matchDateTime;
};

const isMatchOpenForPredictions = (match) => {
  if (match.status !== 'pending' && match.status !== 'open') return false;
  // Si el admin lo puso como 'open', se habilita manualmente sin importar la ventana de 24h
  if (match.status === 'open') return true;
  const matchDateTime = getMatchDate(match.match_date, match.match_time);
  if (!matchDateTime) return false;
  const openFrom = new Date(matchDateTime.getTime() - PREDICTION_WINDOW_HOURS * 60 * 60 * 1000);
  const now = new Date();
  return now >= openFrom && now < matchDateTime;
};

function MatchCard({ match, user, existing, predictions, submitPrediction, handlePredict, handleSubmit, liveResult, live, pendingConfirm }) {
  const isOpen = isMatchOpenForPredictions(match);
  const st = isOpen ? statusMap.open : (statusMap[match.status] || statusMap.pending);
  // 'live' (prop) lo fuerza el horario: aunque la BD diga 'open', si el
  // partido ya empezó se trata como en vivo (sección EN VIVO + marcador).
  // 'pendingConfirm' lo anula: SportScore ya lo dio por finalizado, así que
  // se muestra en FINALIZADOS (no en vivo) aunque la BD aún diga 'live'.
  const isLive = (match.status === 'live' || !!live) && !pendingConfirm;

  // Datos en vivo de SportScore (se refrescan solos cada 30s vía useLiveResults).
  // Si hay marcador en vivo, lo mostramos en lugar del estático de la BD.
  const liveScore = liveResult && liveResult.team1Score != null && liveResult.team2Score != null
    ? { t1: liveResult.team1Score, t2: liveResult.team2Score }
    : null;
  const liveLabel = liveResult?.label; // "67'", "HT", "Finalizado"...

  // Resultado conocido: partido finalizado con marcador publicado.
  // El veredicto (acertó/no acertó) se calcula localmente con la misma regla
  // que evaluateMatchPredictions (marcador exacto) para mostrarlo apenas se
  // publique el resultado, sin esperar a que corra la evaluación (scored).
  const resultKnown = match.status === 'finished' && match.result_team1 != null && match.result_team2 != null;
  const predHit = existing && resultKnown && (
    existing.scored
      ? !!existing.is_correct
      : Number(existing.pred_team1) === Number(match.result_team1) &&
        Number(existing.pred_team2) === Number(match.result_team2)
  );

  return (
    <m.div
      layout
      initial={{ opacity: 0, y: 16 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, scale: 0.95 }}
      transition={{ duration: 0.3, ease: 'easeOut' }}
    >
      <Card className={`card-hover ${isLive ? 'ring-2 ring-red-500/50 glow-sm' : ''}`}>
        <CardContent className="p-3 sm:p-4 md:p-5">
          {/* Date & Status */}
          <div className="flex items-center justify-between mb-3">
            <div className="flex items-center gap-2 text-sm text-muted-foreground">
              <Calendar className="w-4 h-4" />
              {formatMatchDate(match.match_date)}
              <Clock className="w-4 h-4 ml-1" />
              {formatTime12h(match.match_time)}
            </div>
            <Badge className={`${st.class} border-0`}>
              {isLive ? 'EN VIVO' : st.label}
            </Badge>
          </div>

          {match.group_stage && (
            <p className="text-xs text-muted-foreground mb-2 uppercase tracking-wider font-medium">{match.group_stage}</p>
          )}

          {/* Teams, Score & Prediction */}
          <div className="grid grid-cols-[minmax(0,1fr)_auto_minmax(0,1fr)] gap-1.5 sm:gap-3 md:gap-4 py-4 items-start">
            {/* Team 1 */}
            <div className="flex flex-col items-center gap-1.5 min-w-0">
              <TeamFlag team={match.team1} isLive={isLive} size="hero" />
              <span className="font-bold text-xs sm:text-base md:text-lg text-center leading-tight break-words w-full">{match.team1}</span>
            </div>

            {/* Center column: Score + Prediction */}
            <div className="flex flex-col items-center gap-3 w-[130px] sm:w-[150px] md:min-w-[170px]">
              {/* Score / VS */}
              <div className="flex flex-col items-center gap-1">
                {match.status === 'finished' || isLive || pendingConfirm ? (
                  <>
                    {/* Minuto en vivo — ARRIBA del marcador */}
                    {isLive && liveLabel && (
                      <span className="text-[11px] font-bold flex items-center gap-1 text-red-600">
                        <span className="w-1.5 h-1.5 rounded-full bg-red-600 animate-pulse" />
                        {liveLabel}
                      </span>
                    )}
                    <m.div
                      className={`font-bold px-4 py-2 rounded-xl text-base min-w-[80px] text-center ${
                        isLive ? 'bg-red-600 text-white' : 'bg-primary text-primary-foreground'
                      }`}
                      initial={isLive ? { scale: 1 } : undefined}
                      animate={isLive ? { scale: [1, 1.03, 1] } : undefined}
                      transition={isLive ? { repeat: Infinity, duration: 2 } : undefined}
                    >
                      {/* En vivo: marcador de SportScore (auto-actualizado). Si no
                          hay dato en vivo aún, cae al resultado de la BD. */}
                      {liveScore ? liveScore.t1 : (match.result_team1 != null ? match.result_team1 : '-')}
                      {' - '}
                      {liveScore ? liveScore.t2 : (match.result_team2 != null ? match.result_team2 : '-')}
                    </m.div>
                    {/* Finalizado en SportScore, pendiente de que el admin confirme/publique */}
                    {pendingConfirm && (
                      <span className="text-[11px] font-bold text-amber-600 dark:text-amber-400 flex items-center gap-1">
                        <Clock className="w-3 h-3" />
                        Por confirmar
                      </span>
                    )}
                  </>
                ) : (
                  <div className="px-4 py-2 rounded-xl bg-muted/50">
                    <span className="text-muted-foreground font-bold text-base">VS</span>
                  </div>
                )}
              </div>

              {/* Prediction - compact & centered */}
              {isLive ? (
                <div className="space-y-2 w-full">
                  <div className="text-center text-[11px] text-muted-foreground flex items-center justify-center gap-1 py-1.5 bg-red-50 dark:bg-red-950/20 rounded-lg">
                    <span className="w-1.5 h-1.5 rounded-full bg-red-500 animate-pulse" />
                    Partido en curso
                  </div>
                  {existing && (
                    <m.div
                      initial={{ opacity: 0, y: 8 }}
                      animate={{ opacity: 1, y: 0 }}
                      transition={{ duration: 0.3, ease: 'easeOut' }}
                    >
                      <div className="bg-muted/40 border border-border/50 rounded-xl p-2 sm:p-3 space-y-1.5 sm:space-y-2">
                        <div className="flex items-center justify-center gap-2">
                          <span className="text-lg font-black">{existing.pred_team1}</span>
                          <span className="text-base font-bold text-muted-foreground/40">-</span>
                          <span className="text-lg font-black">{existing.pred_team2}</span>
                        </div>
                        {resultKnown && user?.role !== 'admin' ? (
                          <div className="space-y-1">
                            <p className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wider text-center">Tu pronóstico:</p>
                            <p className="text-xs font-bold text-foreground text-center">
                              {match.team1} {existing.pred_team1} - {existing.pred_team2} {match.team2}
                            </p>
                            <div className={`flex items-center justify-center gap-1.5 py-1.5 px-2 rounded-lg ${
                              predHit
                                ? 'bg-emerald-50 dark:bg-emerald-950/20 text-emerald-700 dark:text-emerald-300'
                                : 'bg-red-50 dark:bg-red-950/20 text-red-600 dark:text-red-400'
                            }`}>
                              {predHit ? (
                                <><CheckCircle2 className="w-4 h-4" /><span className="font-semibold text-xs">🏆 ¡Ganaste! +100 pts</span></>
                              ) : (
                                <><X className="w-4 h-4" /><span className="font-semibold text-xs">Perdiste — no acertaste el marcador</span></>
                              )}
                            </div>
                          </div>
                        ) : user?.role === 'admin' ? (
                          <div className="text-center text-[11px] text-muted-foreground font-medium py-1.5 px-2 rounded-lg bg-muted/30">
                            <p>Tu pronóstico: {match.team1} {existing.pred_team1} - {existing.pred_team2} {match.team2}</p>
                            {resultKnown ? (
                              <p className={`font-semibold mt-0.5 ${predHit ? 'text-emerald-600 dark:text-emerald-400' : 'text-red-500'}`}>
                                {predHit ? 'Acertaste' : 'No acertaste'} · los admins no acumulan puntos
                              </p>
                            ) : (
                              <p className="text-[10px] mt-0.5">Los admins no acumulan puntos</p>
                            )}
                          </div>
                        ) : (
                          <div className="space-y-1">
                            <p className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wider text-center">Tu pronóstico:</p>
                            <p className="text-xs font-bold text-foreground text-center">
                              {match.team1} {existing.pred_team1} - {existing.pred_team2} {match.team2}
                            </p>
                            <div className="text-center text-[11px] text-amber-600 dark:text-amber-400 font-medium py-1.5 px-2 rounded-lg bg-amber-50 dark:bg-amber-950/20 space-y-0.5">
                              <p>⏳ Pendiente del resultado final — si aciertas ganas</p>
                              <p className="font-bold">+100 pts</p>
                            </div>
                          </div>
                        )}
                      </div>
                    </m.div>
                  )}
                </div>
              ) : existing ? (
                <m.div
                  initial={{ opacity: 0, y: 8 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ duration: 0.3, ease: 'easeOut' }}
                  className="w-full"
                >
                  <div className="bg-muted/40 border border-border/50 rounded-xl p-2 sm:p-3 space-y-1.5 sm:space-y-2">
                    <div className="flex items-center justify-center gap-2">
                      <span className="text-lg font-black">{existing.pred_team1}</span>
                      <span className="text-base font-bold text-muted-foreground/40">-</span>
                      <span className="text-lg font-black">{existing.pred_team2}</span>
                    </div>
                    {resultKnown && user?.role !== 'admin' ? (
                      <div className="space-y-1">
                        <p className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wider text-center">Tu pronóstico:</p>
                        <p className="text-xs font-bold text-foreground text-center">
                          {match.team1} {existing.pred_team1} - {existing.pred_team2} {match.team2}
                        </p>
                        <div className={`flex items-center justify-center gap-1.5 py-1.5 px-2 rounded-lg ${
                          predHit
                            ? 'bg-emerald-50 dark:bg-emerald-950/20 text-emerald-700 dark:text-emerald-300'
                            : 'bg-red-50 dark:bg-red-950/20 text-red-600 dark:text-red-400'
                        }`}>
                          {predHit ? (
                            <><CheckCircle2 className="w-4 h-4" /><span className="font-semibold text-xs">🏆 ¡Ganaste! +100 pts</span></>
                          ) : (
                            <><X className="w-4 h-4" /><span className="font-semibold text-xs">Perdiste — no acertaste el marcador</span></>
                          )}
                        </div>
                      </div>
                    ) : user?.role === 'admin' ? (
                      <div className="text-center text-[11px] text-muted-foreground font-medium py-1.5 px-2 rounded-lg bg-muted/30">
                        <p>Tu pronóstico: {match.team1} {existing.pred_team1} - {existing.pred_team2} {match.team2}</p>
                        {resultKnown ? (
                          <p className={`font-semibold mt-0.5 ${predHit ? 'text-emerald-600 dark:text-emerald-400' : 'text-red-500'}`}>
                            {predHit ? 'Acertaste' : 'No acertaste'} · los admins no acumulan puntos
                          </p>
                        ) : (
                          <p className="text-[10px] mt-0.5">Los admins no acumulan puntos</p>
                        )}
                      </div>
                    ) : (
                      <div className="space-y-1">
                        <p className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wider text-center">Tu pronóstico:</p>
                        <p className="text-xs font-bold text-foreground text-center">
                          {match.team1} {existing.pred_team1} - {existing.pred_team2} {match.team2}
                        </p>
                        <div className="text-center text-[11px] text-amber-600 dark:text-amber-400 font-medium py-1.5 px-2 rounded-lg bg-amber-50 dark:bg-amber-950/20 space-y-0.5">
                          <p>⏳ Pendiente del resultado final — si aciertas ganas</p>
                          <p className="font-bold">+100 pts</p>
                        </div>
                      </div>
                    )}
                  </div>
                </m.div>
              ) : match.status === 'finished' ? (
                <div className="text-[11px] text-muted-foreground flex items-center justify-center gap-1 py-1.5 px-3 bg-muted/30 rounded-lg w-full">
                  <Lock className="w-3 h-3" />
                  Finalizado
                </div>
              ) : match.status === 'pending' && !isOpen ? (
                <div className="text-[11px] text-muted-foreground flex items-center justify-center gap-1 py-1.5 px-3 bg-muted/30 rounded-lg w-full">
                  <Clock className="w-3 h-3" />
                  {(() => {
                    const t = getTimeUntilOpen(match.match_date, match.match_time);
                    return t ? `Abre en ${t}` : 'Abriendo pronto...';
                  })()}
                </div>
              ) : !user && isOpen ? (
                <Link to="/register" className="w-full">
                  <Button size="sm" variant="outline" className="gap-1.5 h-8 text-xs w-full">
                    <UserPlus className="w-3 h-3" />
                    Registrarme
                  </Button>
                </Link>
              ) : isOpen ? (
                <m.div
                  initial={{ opacity: 0, y: 8 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ duration: 0.3, ease: 'easeOut' }}
                  className="w-full"
                >
                  <div className="bg-muted/40 border border-border/50 rounded-xl p-2 sm:p-3 space-y-2">
                    {/* Score inputs side by side */}
                    <div className="flex items-center justify-center gap-1.5 sm:gap-2">
                      <Input
                        type="number"
                        inputMode="numeric"
                        min="0"
                        className="w-11 sm:w-12 h-10 sm:h-11 text-center text-base font-bold px-1"
                        placeholder="0"
                        value={predictions[match.id]?.team1 ?? ''}
                        onChange={(e) => handlePredict(match.id, 'team1', e.target.value)}
                      />
                      <span className="text-base sm:text-lg font-bold text-muted-foreground/40">-</span>
                      <Input
                        type="number"
                        inputMode="numeric"
                        min="0"
                        className="w-11 sm:w-12 h-10 sm:h-11 text-center text-base font-bold px-1"
                        placeholder="0"
                        value={predictions[match.id]?.team2 ?? ''}
                        onChange={(e) => handlePredict(match.id, 'team2', e.target.value)}
                      />
                    </div>

                    {/* Submit button */}
                    <Button
                      onClick={() => handleSubmit({
                        match_id: match.id,
                        user_email: user.email,
                        pred_team1: Number(predictions[match.id]?.team1),
                        pred_team2: Number(predictions[match.id]?.team2),
                      })}
                      disabled={submitPrediction.isPending}
                      size="sm"
                      className="w-full gap-1.5 h-9 text-xs sm:text-sm font-semibold"
                    >
                      <Send className="w-3.5 h-3.5" />
                      {submitPrediction.isPending ? 'Enviando...' : 'Enviar Pronóstico'}
                    </Button>

                    {/* Info */}
                    <div className="flex items-center justify-center gap-1 text-[10px] sm:text-[11px] text-amber-600 dark:text-amber-400 font-medium bg-amber-50 dark:bg-amber-950/20 px-1.5 py-1 rounded-md">
                      <Trophy className="w-3 h-3 shrink-0" />
                      <span><strong>100 pts</strong> si aciertas</span>
                    </div>
                  </div>
                </m.div>
              ) : (
                <div className="text-[11px] text-muted-foreground flex items-center justify-center gap-1 py-1.5 px-3 bg-muted/30 rounded-lg w-full">
                  <Lock className="w-3 h-3" />
                  Pronósticos cerrados
                </div>
              )}
            </div>

            {/* Team 2 */}
            <div className="flex flex-col items-center gap-1.5 min-w-0">
              <TeamFlag team={match.team2} isLive={isLive} size="hero" />
              <span className="font-bold text-xs sm:text-base md:text-lg text-center leading-tight break-words w-full">{match.team2}</span>
            </div>
          </div>
        </CardContent>
      </Card>
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

export default function Matches() {
  const { user } = useOutletContext();
  const queryClient = useQueryClient();
  const [predictionsState, setPredictionsState] = useState({});

  const { data: rawMatches = [], isLoading } = useQuery({
    queryKey: ['matches'],
    queryFn: () => api.entities.Match.list(),
  });

  const matches = React.useMemo(() =>
    rawMatches.toSorted((a, b) => {
      if (a.match_date !== b.match_date) return a.match_date?.localeCompare(b.match_date);
      return (a.match_time || '').localeCompare(b.match_time || '');
    }), [rawMatches]);

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
      toast.success('¡Pronóstico enviado! 🏆 +100 pts si aciertas');
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
    // Si algún campo está vacío, se envía como 0 automáticamente
    const pred = predictionsState[data.match_id];
    const t1 = pred?.team1 !== undefined && pred?.team1 !== '' ? Number(pred.team1) : 0;
    const t2 = pred?.team2 !== undefined && pred?.team2 !== '' ? Number(pred.team2) : 0;
    submitPrediction.mutate({
      ...data,
      pred_team1: t1,
      pred_team2: t2,
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
