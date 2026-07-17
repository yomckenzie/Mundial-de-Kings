import React, { useState } from 'react';
import { m } from 'framer-motion';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Trophy, ChevronDown } from 'lucide-react';
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
//   `extra_<questionId>`        = opción elegida ('Sí', 'Mbappé', 'Otro', etc.) o null
//   `extra_other_<questionId>`  = texto libre cuando value === 'Otro'
// ─────────────────────────────────────────────────────────────────────

function PointsPill({ children }) {
  return (
    <span className="inline-flex items-center text-[10px] font-bold leading-none text-amber-700 dark:text-amber-300 bg-amber-100 dark:bg-amber-900/40 border border-amber-300/60 dark:border-amber-700/50 rounded-full px-1.5 py-0.5 tabular-nums shrink-0 whitespace-nowrap">
      {children}
    </span>
  );
}

function ExtraOptionRow({ options, value, onSelect, cols, disabled }) {
  return (
    <div className="grid gap-1.5" style={{ gridTemplateColumns: `repeat(${cols}, minmax(0, 1fr))` }}>
      {options.map(opt => (
        <Button
          key={opt}
          size="sm"
          variant={value === opt ? 'default' : 'outline'}
          className="h-8 text-[11px] sm:text-xs px-1 whitespace-nowrap"
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
  const otherKey = `extra_other_${question.id}`;
  const value = form?.[valueKey] ?? null;
  const otherValue = form?.[otherKey] ?? '';

  const options = question.allowOther ? [...question.options, 'Otro'] : question.options;
  const cols = options.length >= 4 ? 2 : options.length;

  const handleSelect = (opt) => {
    handlePredict(matchId, valueKey, opt);
    // Si NO eligió "Otro", limpiar el texto libre para no arrastrar basura.
    if (opt !== 'Otro') handlePredict(matchId, otherKey, '');
  };

  return (
    <div className="bg-card border border-border/60 rounded-xl p-3 space-y-2">
      <div className="flex items-start justify-between gap-2">
        <p className="text-[13px] font-semibold leading-snug">
          <span className="text-muted-foreground">{index}. </span>{question.q}
        </p>
        <PointsPill>+{POINTS_PER_EXTRA} pts</PointsPill>
      </div>
      <ExtraOptionRow
        options={options}
        value={value}
        onSelect={handleSelect}
        cols={cols}
        disabled={disabled}
      />
      {question.allowOther && value === 'Otro' && (
        <Input
          type="text"
          placeholder="Nombre del jugador"
          className="h-8 text-xs"
          value={otherValue}
          disabled={disabled}
          onChange={(e) => handlePredict(matchId, otherKey, e.target.value)}
        />
      )}
    </div>
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

  return (
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
  );
}