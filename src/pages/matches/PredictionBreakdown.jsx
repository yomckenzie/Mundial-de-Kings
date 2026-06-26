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

// Renderiza el resumen del pronóstico en formato legible.
// Soporta v2 (pred_winner='1'/'2' + pred_method + pred_score_team1/2 +
// pred_pen_team1/2) y legacy (pred_team1/pred_team2 sin pred_winner/method).
function renderPickSummary(existing, match) {
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
  // Marcador pre-pen siempre es empate (regla del fútbol).
  const scoreStr = existing.pred_method === 'pen'
    && existing.pred_score_team1 != null
    && existing.pred_score_team2 != null
      ? ` · pre-pen ${existing.pred_score_team1}-${existing.pred_score_team2}`
      : existing.pred_score_team1 != null && existing.pred_score_team2 != null
        ? ` · ${existing.pred_score_team1}-${existing.pred_score_team2}`
        : '';
  const penStr = existing.pred_method === 'pen'
    && existing.pred_pen_team1 != null
    && existing.pred_pen_team2 != null
      ? ` · pen ${existing.pred_pen_team1}-${existing.pred_pen_team2}`
      : '';
  return `${winnerLabel} · ${methodLabel}${scoreStr}${penStr}`;
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
        <p>Tu pronóstico: {renderPickSummary(existing, match)}</p>
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
          {renderPickSummary(existing, match)}
        </p>
        <div className="text-center text-[11px] text-amber-600 dark:text-amber-400 font-medium py-1.5 px-2 rounded-lg bg-amber-50 dark:bg-amber-950/20 space-y-0.5">
          <p>⏳ Pendiente del resultado final — si aciertas podés ganar</p>
          <p className="font-bold">hasta 250 pts (si va a penales)</p>
        </div>
      </div>
    );
  }

  // Partido finalizado → desglose de puntaje.
  // Para predicciones legacy (sin pred_winner/method) mostramos el marcador
  // y un único veredicto binario (compatible con el flujo anterior).
  if (isLegacy) {
    return (
      <div className="space-y-1">
        <p className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wider text-center">Tu pronóstico:</p>
        <p className="text-xs font-bold text-foreground text-center">
          {match.team1} {existing.pred_team1 ?? '?'} - {existing.pred_team2 ?? '?'} {match.team2}
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
    );
  }

  // Predicción nueva (v2 — 3 picks: ganador + método + marcador).
  // Render de filas según el método REAL del partido:
  //   - Siempre: Ganador (50), Cómo gana (50).
  //   - Si result_method === 'pen': Pre-penales (50) + Penales (100).
  //     NO se muestra "Marcador" (sería redundante: score_correct ya engloba
  //     pre-pen + pen cuando ambos son correctos).
  //   - Si result_method ∈ {'90', 'et'}: Marcador (100).
  //   - "Marcador" / "Pre-penales" / "Penales" muestran "⏸ no aplica" si
  //     result_method es null (sin resultado) o si el usuario apostó a un
  //     método distinto (scoreCorrect queda en null en backend, pero acá
  //     lo cubrimos también visualmente).
  const resultMethod = match.result_method;
  const showScoreRow = resultMethod === '90' || resultMethod === 'et';
  const showPrePenRow = resultMethod === 'pen';
  const showPenRow = resultMethod === 'pen';
  const scoreNotApplicable = resultMethod == null
    || existing.pred_method !== resultMethod;
  const prePenNotApplicable = resultMethod == null
    || resultMethod !== 'pen'
    || existing.pred_method !== 'pen';
  const penNotApplicable = resultMethod == null
    || resultMethod !== 'pen'
    || existing.pred_method !== 'pen';
  return (
    <div className="space-y-1.5">
      <p className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wider text-center">Tu pronóstico</p>
      <p className="text-xs font-bold text-foreground text-center">
        {renderPickSummary(existing, match)}
      </p>
      <div className="space-y-1">
        <PtsRow label="Ganador" correct={existing.winner_correct} pts={50} />
        <PtsRow label="Cómo gana" correct={existing.method_correct} pts={50} />
        {showPrePenRow && (
          <PtsRow label="Pre-penales" correct={existing.pre_pen_correct} pts={50} notApplicable={prePenNotApplicable} />
        )}
        {showPenRow && (
          <PtsRow label="Penales" correct={existing.pen_correct} pts={100} notApplicable={penNotApplicable} />
        )}
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