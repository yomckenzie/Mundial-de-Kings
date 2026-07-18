import React from 'react';
import { Link } from 'react-router-dom';
import { m } from 'framer-motion';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { trackAndInterpolateMinute } from '@/lib/sportscore';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Calendar, Clock, Lock, UserPlus, Send, Trophy } from 'lucide-react';
import TeamFlag from '@/components/TeamFlag';
import { formatTime12h } from '@/lib/utils';
import { ExistingPredictionPanel } from './PredictionBreakdown';
import ExtraPointsCard, { ExtraPointsPickSummary } from '@/components/matches/ExtraPointsCard';
import { getQuestionsForMatch } from '@/lib/extraQuestions';

// ─────────────────────────────────────────────────────────────────────
// MatchCard (Task 6: 3-step form + post-eval breakdown)
// ─────────────────────────────────────────────────────────────────────

import {
  formatMatchDate,
  statusMap,
  EMPTY_FORM,
  getTimeUntilOpen,
  isMatchOpenForPredictions,
} from '@/lib/matchCardHelpers';

// ── Sub-component: header con fecha, status, equipos y marcador ──────
function MatchHeader({ match, isLive, st, liveScore, liveLabel, liveResult, pendingConfirm }) {
  return (
    <>
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
          <div className="flex flex-col items-center gap-1">
            {match.status === 'finished' || isLive || pendingConfirm ? (
              <>
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
                  {liveScore ? liveScore.t1 : (match.result_team1 != null ? match.result_team1 : '-')}
                  {' - '}
                  {liveScore ? liveScore.t2 : (match.result_team2 != null ? match.result_team2 : '-')}
                </m.div>
                {/* Score de penales en vivo (durante la tanda). FIX (jun 2026):
                    antes solo se mostraba el score 1-1 del 90+ET; ahora también
                    vemos "Pen (X-Y)" cuando SportScore publica los goles de pen
                    uno a uno. */}
                {isLive && liveResult?.penaltyScore && (
                  <span className="text-[10px] font-bold text-amber-600 dark:text-amber-400">
                    Pen ({liveResult.penaltyScore.team1}-{liveResult.penaltyScore.team2})
                  </span>
                )}
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

        {/* Team 2 */}
        <div className="flex flex-col items-center gap-1.5 min-w-0">
          <TeamFlag team={match.team2} isLive={isLive} size="hero" />
          <span className="font-bold text-xs sm:text-base md:text-lg text-center leading-tight break-words w-full">{match.team2}</span>
        </div>
      </div>
    </>
  );
}

// ── Sub-component: form legacy v1 (pre-28 jun) ─────────────────────
// NOTA: el botón "Enviar" NO vive acá. Se renderiza una sola vez al final del
// MatchCard (después del ExtraPointsCard si aplica) para que el usuario tenga
// que recorrer todo el formulario antes de poder enviar — evita que se
// "pase de largo" las preguntas de puntos extra en semifinal/final.
function V1PredictionForm({ match, form, handlePredict }) {
  return (
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
      <div className="flex items-center justify-center gap-1 text-[10px] sm:text-[11px] text-amber-600 dark:text-amber-400 font-medium bg-amber-50 dark:bg-amber-950/20 px-1.5 py-1 rounded-md">
        <Trophy className="w-3 h-3 shrink-0" />
        <span><strong>100 pts</strong> si aciertas</span>
      </div>
    </>
  );
}

// ── Sub-component: form v2 (3 picks independientes, >= 28 jun) ─────
// NOTA: el botón "Enviar" NO vive acá. Se renderiza una sola vez al final del
// MatchCard (después del ExtraPointsCard si aplica) para que el usuario tenga
// que recorrer todo el formulario antes de poder enviar — evita que se
// "pase de largo" las preguntas de puntos extra en semifinal/final.
function V2PredictionForm({ match, form, handlePredict }) {
  return (
    <>
      {/* Paso 1: ¿Quién gana? */}
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

      {/* Paso 3: Marcador final (dinámico según método) */}
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

      <div className="text-[10px] text-amber-600 dark:text-amber-400 font-medium text-center">
        Hasta <strong>200 pts</strong> si aciertas los 3 picks
      </div>
    </>
  );
}

// ── Sub-component: mensajes locked (finalizado / abrirá pronto / cerrados) ─
function LockedMessage({ children, icon: Icon = Lock }) {
  return (
    <div className="text-[11px] text-muted-foreground flex items-center justify-center gap-1 py-1.5 px-3 bg-muted/30 rounded-lg w-full">
      <Icon className="w-3 h-3" />
      {children}
    </div>
  );
}

// ── Helper: resumen read-only de puntos extras ya guardados ──────────
// Se renderiza cuando existe un `existing` con extra_answers. Cuando el
// usuario está editando (sin existing) el form (ExtraPointsCard) ya
// muestra su propio PickSummaryCard — esta helper no aplica.
function ExistingExtrasSummary({ existing, match }) {
  const questions = getQuestionsForMatch(match);
  if (!questions) return null;
  // Solo aplica para predicciones ya enviadas con extras.
  if (!Array.isArray(existing?.extra_answers) || existing.extra_answers.length === 0) {
    return null;
  }
  const picksById = {};
  for (const a of existing.extra_answers) {
    picksById[a.id] = a.value;
  }
  return (
    <ExtraPointsPickSummary
      questions={questions}
      picksById={picksById}
      saved
      extraAnswersCorrect={existing.extra_answers_correct}
    />
  );
}

// ── Helper: bloque inferior (form / locked / register / existing) ──
// NOTA: el botón Enviar vive en MatchCard (no acá) para que aparezca siempre
// al final del card, después del ExtraPointsCard si aplica.
function PredictionBottom({ match, user, existing, form, isOpen, isLive, resultKnown, predHit, isV2, handlePredict }) {
  if (isLive) {
    return (
      <div className="space-y-2 w-full">
        <div className="text-center text-[11px] text-muted-foreground flex items-center justify-center gap-1 py-1.5 bg-red-50 dark:bg-red-950/20 rounded-lg">
          <span className="w-1.5 h-1.5 rounded-full bg-red-500 animate-pulse" />
          Partido en curso
        </div>
        {existing && (
          <m.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.3, ease: 'easeOut' }}>
            <div className="bg-muted/40 border border-border/50 rounded-xl p-2 sm:p-3 space-y-1.5 sm:space-y-2">
              <ExistingPredictionPanel existing={existing} match={match} isAdmin={user?.role === 'admin'} resultKnown={resultKnown} predHit={predHit} />
            </div>
          </m.div>
        )}
      </div>
    );
  }
  if (existing) {
    return (
      <m.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.3, ease: 'easeOut' }} className="w-full">
        <div className="bg-muted/40 border border-border/50 rounded-xl p-2 sm:p-3 space-y-1.5 sm:space-y-2">
          <ExistingPredictionPanel existing={existing} match={match} isAdmin={user?.role === 'admin'} resultKnown={resultKnown} predHit={predHit} />
        </div>
      </m.div>
    );
  }
  if (match.status === 'finished') return <LockedMessage>Finalizado</LockedMessage>;
  if (match.status === 'pending' && !isOpen) {
    const t = getTimeUntilOpen(match.match_date, match.match_time);
    return <LockedMessage icon={Clock}>{t ? `Abre en ${t}` : 'Abriendo pronto...'}</LockedMessage>;
  }
  if (!user && isOpen) {
    return (
      <Link to="/register" className="w-full">
        <Button size="sm" variant="outline" className="gap-1.5 h-8 text-xs w-full">
          <UserPlus className="w-3 h-3" />
          Registrarme
        </Button>
      </Link>
    );
  }
  if (isOpen) {
    return (
      <m.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.3, ease: 'easeOut' }} className="w-full">
        <div className="bg-muted/40 border border-border/50 rounded-xl p-2 sm:p-3 space-y-2">
          {isV2
            ? <V2PredictionForm match={match} form={form} handlePredict={handlePredict} />
            : <V1PredictionForm match={match} form={form} handlePredict={handlePredict} />
          }
        </div>
      </m.div>
    );
  }
  return <LockedMessage>Pronósticos cerrados</LockedMessage>;
}

// ── Componente principal: compositor ────────────────────────────────
export function MatchCard({ match, user, existing, predictions, submitPrediction, handlePredict, handleSubmit, liveResult, live, pendingConfirm, isV2 = true }) {
  const isOpen = isMatchOpenForPredictions(match);
  const st = isOpen ? statusMap.open : (statusMap[match.status] || statusMap.pending);
  const isLive = (match.status === 'live' || !!live) && !pendingConfirm;

  const liveScore = liveResult && liveResult.team1Score != null && liveResult.team2Score != null
    ? { t1: liveResult.team1Score, t2: liveResult.team2Score }
    : null;
  // FIX (jun 2026): cuando SportScore devuelve fase sin minutero (HT/ET/PEN),
  // interpolamos basándonos en el último tracking. Para minutos numéricos
  // (86', 90+', etc.) usamos el label crudo de SportScore.
  const interpolatedMinute = liveResult?.state === 'live'
    ? trackAndInterpolateMinute(match.id, liveResult.minute, liveResult.lastIncidentMinute)
    : null;
  const liveLabel = interpolatedMinute ?? liveResult?.label;

  const resultKnown = match.status === 'finished' && match.result_team1 != null && match.result_team2 != null;
  const predHit = existing && resultKnown && (
    existing.scored
      ? !!existing.is_correct
      : Number(existing.pred_team1) === Number(match.result_team1) &&
        Number(existing.pred_team2) === Number(match.result_team2)
  );

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

  const bottomProps = { match, user, existing, form, isOpen, isLive, resultKnown, predHit, isV2, handlePredict, handleSubmit, submitPrediction };

  // El botón "Enviar" se renderiza UNA SOLA VEZ al final del card, debajo del
  // ExtraPointsCard si aplica. Esto fuerza al usuario a recorrer TODO el form
  // (predicción principal + puntos extra en semifinal/final) antes de poder
  // apostar, evitando submits accidentales que se "pasan de largo" las
  // preguntas extra.
  const showSubmitButton = isOpen && !isLive && !existing && !!user;

  return (
    <m.div layout initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, scale: 0.95 }} transition={{ duration: 0.3, ease: 'easeOut' }}>
      <Card className={`card-hover ${isLive ? 'ring-2 ring-red-500/50 glow-sm' : ''}`}>
        <CardContent className="p-3 sm:p-4 md:p-5">
          <MatchHeader match={match} isLive={isLive} st={st} liveScore={liveScore} liveLabel={liveLabel} liveResult={liveResult} pendingConfirm={pendingConfirm} />
          <div className="border-t border-border/50 -mx-4 sm:-mx-5 md:mx-0 px-4 sm:px-5 md:px-0 pt-3 pb-1">
            <div className="md:max-w-md md:mx-auto space-y-2">
              <PredictionBottom {...bottomProps} />
              {/* Puntos extras — editable: solo en semifinal/final y cuando el
                  partido está abierto, no está en vivo y aún no hay predicción
                  previa. El resumen read-only se renderiza en ambos casos (con
                  el form para picks en progreso, con existing para picks
                  ya guardados) — ver ExtraPointsPickSummary más abajo. */}
              {isOpen && !isLive && !existing && getQuestionsForMatch(match) && (
                <ExtraPointsCard match={match} form={form} handlePredict={handlePredict} />
              )}
              {/* Botón Enviar — SIEMPRE al final, después del ExtraPointsCard
                  si existe. El usuario tiene que llegar hasta acá para poder
                  enviar, lo cual previene submits accidentales antes de
                  completar los puntos extra. */}
              {showSubmitButton && (
                <Button
                  onClick={() => handleSubmit({ match_id: match.id, user_email: user.email })}
                  disabled={
                    submitPrediction.isPending
                    || (isV2 && (!form.pred_winner || !form.pred_method))
                  }
                  size="sm"
                  className="w-full gap-1.5 h-9 text-xs font-semibold"
                >
                  <Send className="w-3.5 h-3.5" />
                  <span>{submitPrediction.isPending ? 'Enviando...' : 'Enviar'}</span>
                </Button>
              )}
              {/* Resumen read-only de extras: se muestra también cuando hay
                  existing (no se renderiza el form), para que el usuario vea
                  qué eligió de puntos extras aún después de enviar el
                  pronóstico principal. */}
              {getQuestionsForMatch(match) && (
                <ExistingExtrasSummary existing={existing} match={match} />
              )}
            </div>
          </div>
        </CardContent>
      </Card>
    </m.div>
  );
}