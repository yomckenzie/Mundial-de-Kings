// Matriz de transiciones de estado de un partido — ÚNICA fuente de verdad.
// Antes estaba duplicada en useMatchHandlers.js y MatchCardItem.jsx, lo que
// permitía que divergieran. Importar siempre desde acá.
//
// pending  → open, closed
// open     → live, closed, pending
// live     → finished, closed, open   (open = "Reabrir": limpia resultado)
// closed   → live, finished, open     (open = "Reabrir": reabre pronósticos)
// finished → live, open
//
// 'open' es alcanzable desde live/closed/finished porque el botón "Reabrir"
// (MatchCardItem) ofrece esa acción para los tres estados. Sin estas entradas,
// "Reabrir" fallaba con "Transición no permitida".
export const VALID_TRANSITIONS = {
  pending:  new Set(['open', 'closed']),
  open:     new Set(['live', 'closed', 'pending']),
  live:     new Set(['finished', 'closed', 'open']),
  closed:   new Set(['live', 'finished', 'open']),
  finished: new Set(['live', 'open']),
};

export function isValidTransition(from, to) {
  if (from === to) return true;
  return VALID_TRANSITIONS[from]?.has(to) ?? false;
}
