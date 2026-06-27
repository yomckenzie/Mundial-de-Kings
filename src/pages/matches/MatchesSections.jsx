import { m, AnimatePresence } from 'framer-motion';
import { MatchCard } from './MatchCard';

/**
 * Sección "EN VIVO" — partidos que están siendo jugados ahora mismo.
 * Se anima con framer-motion al aparecer/desaparecer.
 */
export function LiveMatchesSection({ liveMatches, renderCard }) {
  if (!liveMatches.length) return null;
  return (
    <AnimatePresence mode="popLayout">
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
          {liveMatches.map(match => renderCard(match, { live: true }))}
        </div>
      </m.div>
    </AnimatePresence>
  );
}

/**
 * Sección "PRÓXIMOS PARTIDOS" — partidos abiertos/pendientes visibles
 * cuyo inicio aún no llegó.
 */
export function UpcomingMatchesSection({ upcomingMatches, renderCard }) {
  if (!upcomingMatches.length) return null;
  return (
    <AnimatePresence mode="popLayout">
      <m.div
        key="upcoming"
        initial={{ opacity: 0, y: 10 }}
        animate={{ opacity: 1, y: 0 }}
      >
        <h2 className="font-display text-2xl tracking-wide mb-3">PRÓXIMOS PARTIDOS</h2>
        <div className="space-y-4">
          {upcomingMatches.map(match => renderCard(match, {}))}
        </div>
      </m.div>
    </AnimatePresence>
  );
}

/**
 * Sección "FINALIZADOS" — partidos con resultado publicado o por confirmar
 * (SportScore los terminó pero el admin aún no publicó). Collapseable.
 */
export function FinishedMatchesSection({ finishedMatches, pendingConfirmMatches, renderCard }) {
  if (!finishedMatches.length) return null;
  return (
    <div>
      <details className="group" open={pendingConfirmMatches.length > 0}>
        <summary className="font-display text-2xl tracking-wide mb-3 cursor-pointer hover:text-secondary transition flex items-center gap-2">
          FINALIZADOS
          <span className="text-sm font-sans font-normal text-muted-foreground">({finishedMatches.length})</span>
        </summary>
        <div className="space-y-4 mt-4">
          <AnimatePresence>
            {finishedMatches.map(match => renderCard(match, { finished: true }))}
          </AnimatePresence>
        </div>
      </details>
    </div>
  );
}

/**
 * Sección "CERRADOS SIN RESULTADO" — partidos cerrados pero sin resultado
 * publicado todavía. Collapseable.
 */
export function ClosedMatchesSection({ closedMatches, renderCard }) {
  if (!closedMatches.length) return null;
  return (
    <div>
      <details className="group">
        <summary className="font-display text-2xl tracking-wide mb-3 cursor-pointer hover:text-secondary transition flex items-center gap-2 text-muted-foreground">
          CERRADOS SIN RESULTADO
          <span className="text-sm font-sans font-normal text-muted-foreground">({closedMatches.length})</span>
        </summary>
        <div className="space-y-4 mt-4">
          <AnimatePresence>
            {closedMatches.map(match => renderCard(match, {}))}
          </AnimatePresence>
        </div>
      </details>
    </div>
  );
}