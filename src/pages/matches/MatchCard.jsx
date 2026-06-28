import React from 'react';
import { Link } from 'react-router-dom';
import { m } from 'framer-motion';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Calendar, Clock, Lock, UserPlus, Send, Trophy } from 'lucide-react';
import TeamFlag from '@/components/TeamFlag';
import { formatTime12h } from '@/lib/utils';
import { ExistingPredictionPanel } from './PredictionBreakdown';

// ─────────────────────────────────────────────────────────────────────
// MatchCard (Task 6: 3-step form + post-eval breakdown)
// ─────────────────────────────────────────────────────────────────────

import {
  formatMatchDate,
  statusMap,
  getMatchDate,
  EMPTY_FORM,
  getTimeUntilOpen,
  isWithinVisibilityWindow,
  isMatchOpenForPredictions,
} from '@/lib/matchCardHelpers';

export function MatchCard({ match, user, existing, predictions, submitPrediction, handlePredict, handleSubmit, liveResult, live, pendingConfirm, isV2 = true }) {
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

  // Task 5 v2: forma actual del formulario (3 picks independientes). Si hay
  // una predicción guardada, la usamos como fuente para pre-rellenar
  // (re-abrir el partido). Para predicciones legacy (sin nuevos campos),
  // partimos de EMPTY_FORM.
  const savedForm = existing && (existing.pred_winner != null || existing.pred_method != null)
    ? {
        pred_winner: existing.pred_winner ?? null,
        pred_method: existing.pred_method ?? null,
        pred_score_team1: existing.pred_score_team1 != null ? String(existing.pred_score_team1) : '',
        pred_score_team2: existing.pred_score_team2 != null ? String(existing.pred_score_team2) : '',
        pred_pen_team1: existing.pred_pen_team1 != null ? String(existing.pred_pen_team1) : '',
        pred_pen_team2: existing.pred_pen_team2 != null ? String(existing.pred_pen_team2) : '',
      }
    : EMPTY_FORM;
  const form = { ...savedForm, ...(predictions[match.id] || {}) };

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

          {/* Teams & Score header */}
          <div className="grid grid-cols-3 sm:grid-cols-[minmax(0,1fr)_auto_minmax(0,1fr)] gap-2 sm:gap-3 md:gap-4 py-3 sm:py-4 items-center sm:items-start">
            {/* Team 1 */}
            <div className="flex flex-col items-center gap-1.5 min-w-0">
              <TeamFlag team={match.team1} isLive={isLive} size="hero" />
              <span className="font-bold text-xs sm:text-base md:text-lg text-center leading-tight break-words w-full">{match.team1}</span>
            </div>

            {/* Center column: Score + VS (sin form) */}
            <div className="flex flex-col items-center gap-1 w-auto sm:w-[160px] md:min-w-[180px]">
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
                    {/* Cómo terminó el partido — solo visible cuando hay resultado
                        publicado (BD) o marcador en vivo. Mostramos el método real
                        (90/ET/pen) + score de penales si aplica, para que el
                        usuario sepa en qué formato terminó. */}
                    {!isLive && match.result_method && (
                      <span className="text-[10px] font-medium text-muted-foreground">
                        {match.result_method === '90' && '90 min'}
                        {match.result_method === 'et' && 'T. extra'}
                        {match.result_method === 'pen' && match.penalty_score_team1 != null && match.penalty_score_team2 != null && (
                          <>Pen ({match.penalty_score_team1}-{match.penalty_score_team2})</>
                        )}
                        {match.result_method === 'pen' && (match.penalty_score_team1 == null || match.penalty_score_team2 == null) && 'Penales'}
                      </span>
                    )}
                    {isLive && liveResult?.method && (
                      <span className="text-[10px] font-medium text-red-600">
                        {liveResult.method === '90' ? '90 min' : liveResult.method === 'et' ? 'T. extra' : 'Penales'}
                      </span>
                    )}
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
            </div>
            {/* Fin center column (score/VS) */}

            {/* Team 2 — DENTRO del grid header */}
            <div className="flex flex-col items-center gap-1.5 min-w-0">
              <TeamFlag team={match.team2} isLive={isLive} size="hero" />
              <span className="font-bold text-xs sm:text-base md:text-lg text-center leading-tight break-words w-full">{match.team2}</span>
            </div>
          </div>
          {/* Fin HEADER (grid de banderas + marcador) */}

          {/* FORM SECTION — full-width, debajo del header */}
          <div className="border-t border-border/50 -mx-4 sm:-mx-5 px-4 sm:px-5 pt-3 pb-1">
            {/* Prediction - full width */}
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
                        <ExistingPredictionPanel
                          existing={existing}
                          match={match}
                          isAdmin={user?.role === 'admin'}
                          resultKnown={resultKnown}
                          predHit={predHit}
                        />
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
                    <ExistingPredictionPanel
                      existing={existing}
                      match={match}
                      isAdmin={user?.role === 'admin'}
                      resultKnown={resultKnown}
                      predHit={predHit}
                    />
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
                    {/* ─── LEGACY v1 (partidos pre-28 jun) ─── */}
                    {!isV2 && (
                      <>
                        <div className="flex items-center justify-center gap-1.5 sm:gap-2">
                          <Input
                            type="number" inputMode="numeric" min="0"
                            className="w-11 sm:w-12 h-11 sm:h-12 text-center text-base font-bold px-1"
                            placeholder="0"
                            value={form.team1 ?? ''}
                            onChange={(e) => handlePredict(match.id, 'team1', e.target.value)}
                          />
                          <span className="text-base sm:text-lg font-bold text-muted-foreground/40">-</span>
                          <Input
                            type="number" inputMode="numeric" min="0"
                            className="w-11 sm:w-12 h-11 sm:h-12 text-center text-base font-bold px-1"
                            placeholder="0"
                            value={form.team2 ?? ''}
                            onChange={(e) => handlePredict(match.id, 'team2', e.target.value)}
                          />
                        </div>
                        <Button
                          onClick={() => handleSubmit({ match_id: match.id, user_email: user.email })}
                          disabled={submitPrediction.isPending}
                          size="sm"
                          className="w-full min-w-0 gap-1.5 h-9 px-2 text-xs sm:text-sm font-semibold"
                        >
                          <Send className="w-3.5 h-3.5 shrink-0" />
                          <span className="truncate">{submitPrediction.isPending ? 'Enviando...' : 'Enviar'}</span>
                        </Button>
                        <div className="flex items-center justify-center gap-1 text-[10px] sm:text-[11px] text-amber-600 dark:text-amber-400 font-medium bg-amber-50 dark:bg-amber-950/20 px-1.5 py-1 rounded-md">
                          <Trophy className="w-3 h-3 shrink-0" />
                          <span><strong>100 pts</strong> si aciertas</span>
                        </div>
                      </>
                    )}

                    {/* ─── v2 (>= 28 jun): 3 picks independientes ─── */}
                    {isV2 && (
                    <>
                    {/* Paso 1: ¿Quién gana? (v2 — sin Empate) */}
                    <div className="space-y-1">
                      <div className="flex items-center justify-between gap-2">
                        <p className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wider">¿Quién gana?</p>
                        <span className="inline-flex items-center text-[10px] font-bold leading-none text-amber-700 dark:text-amber-300 bg-amber-100 dark:bg-amber-900/40 border border-amber-300/60 dark:border-amber-700/50 rounded-full px-1.5 py-0.5 tabular-nums shrink-0 whitespace-nowrap">+50 pts</span>
                      </div>
                      <div className="grid grid-cols-2 gap-1">
                        {[
                          { value: 'team1', label: match.team1.slice(0, 10) },
                          { value: 'team2', label: match.team2.slice(0, 10) },
                        ].map(opt => (
                          <Button
                            key={opt.value}
                            size="sm"
                            variant={form.pred_winner === opt.value ? 'default' : 'outline'}
                            className="h-8 text-xs px-1"
                            onClick={() => handlePredict(match.id, 'pred_winner', opt.value)}
                          >
                            {opt.label}
                          </Button>
                        ))}
                      </div>
                      {/* FIX (bug v2-gate-28jun): texto explicando que ganador es gate */}
                      <p className="text-[9px] text-amber-700/90 dark:text-amber-400/80 leading-snug text-center px-1 italic">
                        Si no aciertas el ganador, no sumas ningún puntaje
                      </p>
                    </div>

                    {/* Paso 2: ¿Cómo gana? */}
                    <div className="space-y-1">
                      <div className="flex items-center justify-between gap-2">
                        <p className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wider">¿Cómo gana?</p>
                        <span className="inline-flex items-center text-[10px] font-bold leading-none text-amber-700 dark:text-amber-300 bg-amber-100 dark:bg-amber-900/40 border border-amber-300/60 dark:border-amber-700/50 rounded-full px-1.5 py-0.5 tabular-nums shrink-0 whitespace-nowrap">+50 pts</span>
                      </div>
                      <div className="grid grid-cols-3 gap-1.5">
                        {[
                          { value: '90', label: '90 min' },
                          { value: 'et', label: 'T. extra' },
                          { value: 'pen', label: 'Penales' },
                        ].map(opt => (
                          <Button
                            key={opt.value}
                            size="sm"
                            variant={form.pred_method === opt.value ? 'default' : 'outline'}
                            className="h-8 text-[11px] sm:text-xs px-1 whitespace-nowrap"
                            onClick={() => handlePredict(match.id, 'pred_method', opt.value)}
                          >
                            {opt.label}
                          </Button>
                        ))}
                      </div>
                      <div className="text-[9px] text-muted-foreground/80 leading-tight text-center px-1 space-y-0.5">
                        <div>90 min = 90 + tiempo de adición</div>
                        <div>T. extra = 30 min adicionales</div>
                        <div>Penales = definición desde los 11m</div>
                      </div>
                    </div>

                    {/* Paso 3: Marcador final (v2 — dinámico según método) */}
                    {(form.pred_method === '90' || form.pred_method === 'et') && (
                      <div className="space-y-1">
                        <div className="flex items-center justify-between gap-2">
                          <p className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wider">Marcador final</p>
                          <span className="inline-flex items-center text-[10px] font-bold leading-none text-amber-700 dark:text-amber-300 bg-amber-100 dark:bg-amber-900/40 border border-amber-300/60 dark:border-amber-700/50 rounded-full px-1.5 py-0.5 tabular-nums shrink-0 whitespace-nowrap">+100 pts</span>
                        </div>
                        <div className="flex items-center justify-center gap-1.5">
                          <Input
                            type="number" min="0" inputMode="numeric"
                            className="w-11 h-9 text-center text-sm font-bold"
                            placeholder="0"
                            value={form.pred_score_team1}
                            onChange={(e) => handlePredict(match.id, 'pred_score_team1', e.target.value)}
                          />
                          <span className="text-sm font-bold">-</span>
                          <Input
                            type="number" min="0" inputMode="numeric"
                            className="w-11 h-9 text-center text-sm font-bold"
                            placeholder="0"
                            value={form.pred_score_team2}
                            onChange={(e) => handlePredict(match.id, 'pred_score_team2', e.target.value)}
                          />
                        </div>
                      </div>
                    )}
                    {form.pred_method === 'pen' && (
                      <div className="space-y-1">
                        <div className="flex items-center justify-between gap-2">
                          <p className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wider">Penales</p>
                          <span className="inline-flex items-center text-[10px] font-bold leading-none text-amber-700 dark:text-amber-300 bg-amber-100 dark:bg-amber-900/40 border border-amber-300/60 dark:border-amber-700/50 rounded-full px-1.5 py-0.5 tabular-nums shrink-0 whitespace-nowrap">+100 pts</span>
                        </div>
                        <div className="flex items-center justify-center gap-1.5">
                          <Input
                            type="number" min="0" inputMode="numeric"
                            className="w-11 h-9 text-center text-sm font-bold"
                            placeholder="0"
                            value={form.pred_score_team1}
                            onChange={(e) => handlePredict(match.id, 'pred_score_team1', e.target.value)}
                          />
                          <span className="text-sm font-bold">-</span>
                          <Input
                            type="number" min="0" inputMode="numeric"
                            className="w-11 h-9 text-center text-sm font-bold"
                            placeholder="0"
                            value={form.pred_score_team2}
                            onChange={(e) => handlePredict(match.id, 'pred_score_team2', e.target.value)}
                          />
                        </div>
                        <p className="text-[9px] text-muted-foreground/70 leading-tight text-center px-1">
                          Suma los goles de <strong>90 min + ET + penales</strong>
                        </p>
                      </div>
                    )}

                    {/* Botón enviar */}
                    <Button
                      onClick={() => handleSubmit({ match_id: match.id, user_email: user.email })}
                      disabled={submitPrediction.isPending || !form.pred_winner || !form.pred_method}
                      size="sm"
                      className="w-full gap-1.5 h-9 text-xs font-semibold"
                    >
                      <Send className="w-3.5 h-3.5" />
                      <span>{submitPrediction.isPending ? 'Enviando...' : 'Enviar'}</span>
                    </Button>

                    <div className="text-[10px] text-amber-600 dark:text-amber-400 font-medium text-center">
                      Hasta <strong>200 pts</strong> si aciertas los 3 picks
                    </div>
                    </>
                    )}
                  </div>
                </m.div>
              ) : (
                <div className="text-[11px] text-muted-foreground flex items-center justify-center gap-1 py-1.5 px-3 bg-muted/30 rounded-lg w-full">
                  <Lock className="w-3 h-3" />
                  Pronósticos cerrados
                </div>
              )}
            </div>
            {/* Fin FORM SECTION */}
        </CardContent>
      </Card>
    </m.div>
  );
}