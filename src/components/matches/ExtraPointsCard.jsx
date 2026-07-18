import React, { useState } from 'react';
import { m } from 'framer-motion';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Trophy, ChevronDown, Check, Clock } from 'lucide-react';
import { getQuestionsForMatch, getExtraRoundLabel, POINTS_PER_EXTRA } from '@/lib/extraQuestions';

// ─────────────────────────────────────────────────────────────────────
// Sub-form "Puntos extras" — se muestra debajo del form V2 normal en
// MatchCard para partidos semifinal/final del Mundial 2026.
// Las preguntas vienen de `extraQuestions.js` (single source of truth).
//
// Props:
//   match       - partido actual (necesario para resolver preguntas por matchup)
//   form        - state local del usuario (predictionsState[match.id])
//   handlePredict(matchId, field, value) - actualiza el form (idéntico a V2)
//   disabled    - true si la ventana de predicción está cerrada
//
// Las keys en form son:
//   `extra_<questionId>` = opción elegida o null
// ─────────────────────────────────────────────────────────────────────

function PointsPill({ children }) {
  return (
    <span className="inline-flex items-center text-[10px] font-bold leading-none text-amber-700 dark:text-amber-300 bg-amber-100 dark:bg-amber-900/40 border border-amber-300/60 dark:border-amber-700/50 rounded-full px-1.5 py-0.5 tabular-nums shrink-0 whitespace-nowrap">
      {children}
    </span>
  );
}

// Grupo de botones-opción (un solo seleccionado).
// Responsive: en móvil, las filas de 3 columnas (cols=3) se apilan a 1 columna
// para que cada botón tenga ancho cómodo sin recortar texto.
function ExtraOptionRow({ options, value, onSelect, cols, disabled }) {
  const gridColsClass =
    cols === 1 ? 'grid-cols-1' :
    cols === 2 ? 'grid-cols-2' :
    cols === 3 ? 'grid-cols-1 sm:grid-cols-3' :
    /* 4+     */ 'grid-cols-2';
  return (
    <div className={`grid gap-1.5 ${gridColsClass}`}>
      {options.map(opt => (
        <Button
          key={opt}
          size="sm"
          variant={value === opt ? 'default' : 'outline'}
          className="h-auto min-h-8 text-[11px] sm:text-xs py-1.5 px-2 min-w-0 text-center break-words leading-tight whitespace-normal"
          disabled={disabled}
          onClick={() => onSelect(value === opt ? null : opt)}
        >
          {opt}
        </Button>
      ))}
    </div>
  );
}

function ExtraPropCard({ index, question, matchId, form, handlePredict, disabled }) {
  const valueKey = `extra_${question.id}`;
  const value = form?.[valueKey] ?? null;
  const cols = question.options.length >= 4 ? 2 : question.options.length;

  const handleSelect = (opt) => handlePredict(matchId, valueKey, opt);

  return (
    <div className="bg-card border border-border/60 rounded-xl p-3 space-y-2">
      <div className="flex items-start justify-between gap-2">
        <p className="text-[13px] font-semibold leading-snug">
          <span className="text-muted-foreground">{index}. </span>{question.q}
        </p>
        <PointsPill>+{POINTS_PER_EXTRA} pts</PointsPill>
      </div>
      <ExtraOptionRow
        options={question.options}
        value={value}
        onSelect={handleSelect}
        cols={cols}
        disabled={disabled}
      />
    </div>
  );
}

// Resumen "Tus picks · puntos extra" — pure presentacional.
// Acepta:
//   - `picksById`: mapa plano `{ [questionId]: value }` con los picks del
//     usuario (puede venir del local form o de `existing.extra_answers`).
//   - `maxExtra`: opcional, para mostrar "(de X)" en el contador.
//   - `saved`: true cuando los picks ya están persistidos en BD (existing).
//     En ese caso la tarjeta se ve ámbar + clock con "esperando resultado",
//     no verde + check, para no sugerir que ya están "ganados".
//   - `extraAnswersCorrect`: opcional, mapa `{ [qid]: true|false|null }` con
//     la evaluación del backend (true=acertó, false=falló, null=pendiente).
//     Cuando se pasa junto con `saved=true`, el contador muestra SOLO los
//     puntos de los aciertos (no el máximo posible). Si no se pasa, fallback
//     al cálculo antiguo (answeredCount × POINTS_PER_EXTRA).
export function ExtraPointsPickSummary({ questions, picksById, maxExtra, saved = false, extraAnswersCorrect }) {
  if (!questions || questions.length === 0) return null;
  const answeredCount = questions.reduce((acc, q) => acc + (picksById?.[q.id] ? 1 : 0), 0);
  if (answeredCount === 0) return null;
  // En modo saved con evaluación disponible, contamos SOLO los aciertos.
  // Así no mostramos "+35 pts" cuando en realidad el usuario solo ganó +20.
  let earnedPoints;
  if (saved && extraAnswersCorrect) {
    const correctCount = questions.reduce(
      (acc, q) => acc + (extraAnswersCorrect?.[q.id] === true ? 1 : 0),
      0
    );
    earnedPoints = correctCount * POINTS_PER_EXTRA;
  } else {
    // Sin evaluación (form en progreso o admin no cargó respuestas todavía):
    // mostramos el máximo posible para mantener la UX original.
    earnedPoints = answeredCount * POINTS_PER_EXTRA;
  }
  const cap = maxExtra ?? questions.length * POINTS_PER_EXTRA;

  // Estilos según estado: saved (ámbar/esperando) vs in-form (verde/activo).
  const containerClass = saved
    ? 'border-amber-300/50 dark:border-amber-800/40 bg-amber-50/40 dark:bg-amber-950/20'
    : 'border-emerald-300/50 dark:border-emerald-800/40 bg-emerald-50/40 dark:bg-emerald-950/20';
  const iconColor = saved ? 'text-amber-600 dark:text-amber-400' : 'text-emerald-600 dark:text-emerald-400';
  const titleClass = saved
    ? 'text-amber-700 dark:text-amber-300'
    : 'text-emerald-700 dark:text-emerald-300';
  const valueClass = saved
    ? 'text-amber-700 dark:text-amber-300'
    : 'text-emerald-700 dark:text-emerald-300';
  const Icon = saved ? Clock : Check;
  const titleText = saved
    ? 'Tus picks guardados · puntos extra'
    : 'Tus picks · puntos extra';

  return (
    <Card className={`${containerClass} mt-2`}>
      <CardContent className="p-3 space-y-2">
        <div className="flex items-center gap-1.5">
          <Icon className={`w-3.5 h-3.5 ${iconColor} shrink-0`} />
          <p className={`text-[10px] font-semibold uppercase tracking-wider ${titleClass}`}>
            {titleText}
          </p>
          <span className="ml-auto text-[10px] text-muted-foreground tabular-nums">
            {answeredCount}/{questions.length} ·{' '}
            <span className={`${titleClass} font-medium`}>+{earnedPoints} pts</span>{' '}
            <span className="text-muted-foreground/60">(de {cap})</span>
          </span>
        </div>
        {saved && (
          <p className="text-[10px] text-amber-700/80 dark:text-amber-400/80 italic">
            ⏳ Esperando resultado del partido
          </p>
        )}
        <ul className="space-y-1">
          {questions.map((q, i) => {
            const v = picksById?.[q.id] ?? null;
            return (
              <li key={q.id} className="text-xs flex items-baseline gap-2 leading-snug">
                <span className="text-muted-foreground/70 tabular-nums w-4 text-right shrink-0">{i + 1}.</span>
                <span
                  className={`flex-1 min-w-0 truncate ${v ? 'text-muted-foreground/90' : 'text-muted-foreground/40 italic'}`}
                  title={q.q}
                >
                  {q.q}
                </span>
                <span className={`shrink-0 font-semibold tabular-nums ${v ? valueClass : 'text-muted-foreground/40'}`}>
                  {v ? `→ ${v}` : '→ —'}
                </span>
              </li>
            );
          })}
        </ul>
      </CardContent>
    </Card>
  );
}

export default function ExtraPointsCard({ match, form, handlePredict, disabled = false }) {
  const questions = getQuestionsForMatch(match);
  const roundLabel = getExtraRoundLabel(match);
  const [open, setOpen] = useState(true);

  if (!questions || !roundLabel) return null;

  const answeredCount = questions.reduce((acc, q) => {
    const v = form?.[`extra_${q.id}`];
    return acc + (v ? 1 : 0);
  }, 0);
  const maxExtra = questions.length * POINTS_PER_EXTRA;

  // Mapear form plano a picksById para el resumen.
  const picksById = {};
  for (const q of questions) picksById[q.id] = form?.[`extra_${q.id}`] ?? null;

  return (
    <>
      <Card className="border-amber-300/50 dark:border-amber-800/40 mt-3">
        <CardContent className="p-3 sm:p-4">
          <button
            type="button"
            onClick={() => setOpen(o => !o)}
            className="w-full flex items-center justify-between gap-2"
            aria-expanded={open}
          >
            <span className="flex items-center gap-2">
              <Trophy className="w-4 h-4 text-amber-500" />
              <span className="font-display text-base sm:text-lg uppercase tracking-wide">Puntos extras</span>
              <Badge className="border-0 bg-amber-500 text-black text-[10px]">Solo {roundLabel}</Badge>
            </span>
            <ChevronDown className={`w-4 h-4 shrink-0 transition-transform ${open ? 'rotate-180' : ''}`} />
          </button>

          {open && (
            <m.div
              initial={{ opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.25 }}
              className="mt-3 space-y-2"
            >
              <p className="text-[11px] text-muted-foreground">
                Cada acierto vale <strong>+{POINTS_PER_EXTRA} pts</strong> · máximo <strong>+{maxExtra} pts</strong> extra.
              </p>
              <div className="grid sm:grid-cols-2 gap-2">
                {questions.map((q, i) => (
                  <ExtraPropCard
                    key={q.id}
                    index={i + 1}
                    question={q}
                    matchId={match.id}
                    form={form}
                    handlePredict={handlePredict}
                    disabled={disabled}
                  />
                ))}
              </div>
              <p className="text-[10px] text-muted-foreground text-center pt-1">
                {answeredCount}/{questions.length} respondidas ·{' '}
                <span className="text-amber-600 dark:text-amber-400 font-medium">
                  +{answeredCount * POINTS_PER_EXTRA} pts posibles
                </span>
              </p>
            </m.div>
          )}
        </CardContent>
      </Card>
      <ExtraPointsPickSummary questions={questions} picksById={picksById} maxExtra={maxExtra} />
    </>
  );
}
