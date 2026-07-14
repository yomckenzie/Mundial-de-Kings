import React from 'react';
import { CheckCircle2, X } from 'lucide-react';

// ─────────────────────────────────────────────────────────────────────
// Sub-componentes del breakdown post-evaluación (Task 7 — v2 render)
// ─────────────────────────────────────────────────────────────────────

// Helper: fila de puntaje por componente.
//   - correct=true  → ✅ +pts (verde)
//   - correct=false → ❌ 0 (rojo)
//   - notApplicable → ⏸ no aplica (gris) — ej: penal cuando result_method≠pen
//   - correct=null  → ⏳ pendiente (gris) — partido aún no evaluado
function PtsRow({ label, correct, pts, notApplicable }) {
  if (notApplicable) {
    return (
      <div className="flex items-center justify-between text-[11px]">
        <span className="text-muted-foreground">{label}</span>
        <span className="text-muted-foreground/60">⏸ no aplica</span>
      </div>
    );
  }
  if (correct == null) {
    return (
      <div className="flex items-center justify-between text-[11px]">
        <span className="text-muted-foreground">{label}</span>
        <span className="text-muted-foreground/60">⏳ pendiente</span>
      </div>
    );
  }
  return (
    <div className={`flex items-center justify-between text-[11px] ${
      correct ? 'text-emerald-700 dark:text-emerald-400' : 'text-red-600 dark:text-red-400'
    }`}>
      <span>{label}</span>
      <span className="font-semibold">{correct ? `✅ +${pts}` : '❌ 0'}</span>
    </div>
  );
}

// Helper puro: devuelve el string del resumen. Lo separamos del componente
// para mantenerlo testeable y sin JSX.
function buildPickSummary(existing, match) {
  // Legacy: sin pred_winner ni pred_method, pero con marcador viejo cargado.
  const isLegacy = existing.pred_winner == null
    && existing.pred_method == null
    && (existing.pred_team1 != null || existing.pred_team2 != null);
  if (isLegacy) {
    return `${match.team1} ${existing.pred_team1 ?? '?'} - ${existing.pred_team2 ?? '?'} ${match.team2}`;
  }
  const winnerLabel = existing.pred_winner === '1' ? match.team1
    : existing.pred_winner === '2' ? match.team2
    : '?';
  const methodLabel = existing.pred_method === '90' ? '90 min'
    : existing.pred_method === 'et' ? 'T. extra'
    : existing.pred_method === 'pen' ? 'Penales'
    : '?';
  // v2 pen: pred_score_team1/2 = TOTAL (90+ET+pens). Mostramos como "X-Y total".
  const scoreStr = existing.pred_score_team1 != null && existing.pred_score_team2 != null
    ? existing.pred_method === 'pen'
      ? ` · ${existing.pred_score_team1}-${existing.pred_score_team2} total`
      : ` · ${existing.pred_score_team1}-${existing.pred_score_team2}`
    : '';
  return `${winnerLabel} · ${methodLabel}${scoreStr}`;
}

// Componente nombrado (no función inline) para evitar el warning de
// react-doctor "Component rendered by inline function call". React
// preserva su identidad entre renders, evitando que el <span> interno
// se remonte innecesariamente.
function PickSummary({ existing, match }) {
  return <span>{buildPickSummary(existing, match)}</span>;
}

// Renderiza el panel de "predicción guardada" reutilizable.
//   - Admin: muestra el pick + nota "no acumula puntos" (sin desglose).
//   - User normal:
//       * Partido finalizado con resultado → desglose por componente + total.
//       * Partido aún sin finalizar → "pendiente del resultado final".
//   - Predicciones legacy (pred_team1/2, sin pred_winner/method) → fallback
//     al display de marcador simple + veredicto binario compatible.
export function ExistingPredictionPanel({ existing, match, isAdmin, resultKnown, predHit }) {
  const isLegacy = existing.pred_winner == null
    && existing.pred_method == null
    && (existing.pred_team1 != null || existing.pred_team2 != null);

  if (isAdmin) {
    return (
      <div className="text-center text-[11px] text-muted-foreground font-medium py-1.5 px-2 rounded-lg bg-muted/30">
        <p>Tu pronóstico: <PickSummary existing={existing} match={match} /></p>
        {resultKnown ? (
          <p className={`font-semibold mt-0.5 ${predHit ? 'text-emerald-600 dark:text-emerald-400' : 'text-red-500'}`}>
            {predHit ? 'Acertaste' : 'No acertaste'} · los admins no acumulan puntos
          </p>
        ) : (
          <p className="text-[10px] mt-0.5">Los admins no acumulan puntos</p>
        )}
      </div>
    );
  }

  if (!resultKnown) {
    return (
      <div className="space-y-1">
        <p className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wider text-center">Tu pronóstico:</p>
        <p className="text-xs font-bold text-foreground text-center">
          <PickSummary existing={existing} match={match} />
        </p>
        <div className="text-center text-[11px] text-amber-600 dark:text-amber-400 font-medium py-1.5 px-2 rounded-lg bg-amber-50 dark:bg-amber-950/20 space-y-0.5">
          <p>⏳ Pendiente del resultado final — si aciertas podés ganar</p>
          <p className="font-bold">hasta 200 pts (los 3 picks correctos)</p>
        </div>
      </div>
    );
  }

  // Partido finalizado → desglose de puntaje.
  // Para predicciones legacy (sin pred_winner/method) mostramos el marcador
  // pronosticado + el marcador real del partido, y un único veredicto
  // binario (compatible con el flujo anterior).
  if (isLegacy) {
    return (
      <div className="space-y-1">
        <div className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wider text-center space-y-0.5">
          <p>Tu pronóstico:</p>
        </div>
        <p className="text-xs font-bold text-foreground text-center">
          {match.team1} {existing.pred_team1 ?? '?'} - {existing.pred_team2 ?? '?'} {match.team2}
        </p>
        {/* Resultado real del partido — necesario para que el usuario vea
            qué pronosticó vs qué pasó. Sin esto, partidos v1 (pre-28 jun)
            solo muestran un marcador sin contexto.
            FIX (jun 2026): para partidos con method='pen' mostramos el score
            de penales (penalty_score_team1/2) que es lo que se compara con
            la apuesta. El score 90+ET (result_team1/2) sigue siendo útil
            como contexto. */}
        {match.result_team1 != null && match.result_team2 != null && (
          <p className="text-[11px] text-muted-foreground text-center">
            Real:{' '}
            {match.result_method === 'pen' && match.penalty_score_team1 != null && match.penalty_score_team2 != null ? (
              <>
                {/* method='pen': "Penales" queda implícito al mostrar el score
                    de pen, no lo repetimos como método. Scores en negrita. */}
                <span className="text-muted-foreground text-[10px]">
                  90m+ET:{' '}
                  <strong className="text-foreground tabular-nums font-semibold">
                    {match.result_team1}-{match.result_team2}
                  </strong>
                </span>
                <span className="mx-1 text-muted-foreground/50">·</span>
                <span className="text-muted-foreground text-[10px]">
                  Penales:{' '}
                  <strong className="text-foreground tabular-nums font-semibold">
                    {match.penalty_score_team1}-{match.penalty_score_team2}
                  </strong>
                </span>
                <span className="mx-1 text-muted-foreground/50">·</span>
                <strong className="text-amber-700 dark:text-amber-300 font-bold tabular-nums">
                  TOTAL {match.result_team1 + match.penalty_score_team1}-{match.result_team2 + match.penalty_score_team2}
                </strong>
              </>
            ) : (
              <>
                <strong className="text-foreground tabular-nums font-semibold">
                  {match.result_team1}-{match.result_team2}
                </strong>
                {match.result_method && (
                  <span className="ml-1">
                    · {match.result_method === '90' ? '90 min' : match.result_method === 'et' ? 'T. extra' : 'T. regular'}
                  </span>
                )}
              </>
            )}
          </p>
        )}
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
    );
  }

  // Predicción nueva (v2 — 3 picks: ganador + método + marcador).
  // Render de filas:
  //   - Siempre: Ganador (50), Cómo gana (50), Marcador (100).
  //   - Marcador muestra "⏸ no aplica" SOLO si el backend no pudo evaluar
  //     (pred_method≠pen cuando result_method=pen). Para 90/ET el score
  //     SIEMPRE es comparable (90 y ET comparten interpretación). Si el
  //     backend devolvió score_correct=true/false, mostramos el desglose.
  const resultMethod = match.result_method;
  const showScoreRow = resultMethod === '90' || resultMethod === 'et' || resultMethod === 'pen';
  // Backend devuelve score_correct=null cuando NO fue evaluable (típicamente
  // user apostó 90/ET pero el partido fue a pen). En ese caso, "no aplica".
  const scoreNotApplicable = existing.score_correct == null;
  // FIX (bug ux-ambiguo-14jul): el bloque "Tu pronóstico" mostraba el equipo
  // elegido con el emoji 🏆 y el total "X pts" abajo, lo que confundía con
  // que el sistema premiara ese equipo. Diferenciamos visualmente "Tu pick"
  // (lo que elegiste) de "Resultado" (lo que pasó).
  const userPickWinner = existing.pred_winner === '1' ? match.team1
    : existing.pred_winner === '2' ? match.team2
    : existing.pred_winner === 'X' ? 'Empate' : null;
  const actualWinnerTeam = existing.winner_correct === true
    ? userPickWinner
    : (resultMethod != null && match.result_team1 != null && match.result_team2 != null
        ? (match.result_team1 > match.result_team2 ? match.team1
          : match.result_team1 < match.result_team2 ? match.team2
          : 'Empate')
        : null);
  return (
    <div className="space-y-1.5">
      {/* Tu pick (lo que elegiste) — sin emojis que sugieran premio. */}
      <div className="text-center">
        <p className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wider">Tu pick</p>
        <p className="text-xs font-bold text-foreground">
          <PickSummary existing={existing} match={match} />
        </p>
      </div>
      {/* Resultado real — aclará quien ganó para distinguirlo del pick. */}
      {actualWinnerTeam && (
        <p className={`text-[10px] text-center font-medium ${
          existing.winner_correct === true
            ? 'text-emerald-700 dark:text-emerald-400'
            : 'text-red-600 dark:text-red-400'
        }`}>
          {existing.winner_correct === true
            ? `✅ Acertaste — ganó ${actualWinnerTeam}`
            : `❌ Tu equipo perdió — ganó ${actualWinnerTeam}`}
        </p>
      )}
      <div className="space-y-1">
        <PtsRow label="Ganador" correct={existing.winner_correct} pts={50} />
        <PtsRow label="Cómo gana" correct={existing.method_correct} pts={50} />
        {showScoreRow && (
          <PtsRow label="Marcador" correct={existing.score_correct} pts={100} notApplicable={scoreNotApplicable} />
        )}
        <div className="flex items-center justify-between pt-1 border-t border-border/50">
          <span className="text-xs font-bold">Total</span>
          <span className="text-sm font-bold text-amber-600 dark:text-amber-400">
            {existing.points_earned || 0} pts
          </span>
        </div>
      </div>
    </div>
  );
}