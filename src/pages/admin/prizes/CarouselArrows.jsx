import { ChevronLeft, ChevronRight } from 'lucide-react';

/**
 * Flechas Anterior/Siguiente del carrusel. Solo se muestran si hay >1 imagen.
 */
export function CarouselArrows({ canPrev, canNext, onPrev, onNext }) {
  return (
    <>
      <button
        type="button"
        onClick={(e) => { e.stopPropagation(); onPrev(); }}
        disabled={!canPrev}
        className="absolute left-2 top-1/2 -translate-y-1/2 w-8 h-8 rounded-full bg-black/60 text-white flex items-center justify-center disabled:opacity-30 hover:bg-black/80 transition-all"
        aria-label="Imagen anterior"
      >
        <ChevronLeft className="w-4 h-4" />
      </button>
      <button
        type="button"
        onClick={(e) => { e.stopPropagation(); onNext(); }}
        disabled={!canNext}
        className="absolute right-2 top-1/2 -translate-y-1/2 w-8 h-8 rounded-full bg-black/60 text-white flex items-center justify-center disabled:opacity-30 hover:bg-black/80 transition-all"
        aria-label="Siguiente imagen"
      >
        <ChevronRight className="w-4 h-4" />
      </button>
    </>
  );
}

/**
 * Dots del carrusel (indicadores de posición clickables).
 */
export function CarouselDots({ total, activeIndex, onSelect }) {
  return (
    <div className="flex items-center justify-center gap-1.5">
      {Array.from({ length: total }).map((_, i) => (
        <button
          key={`dot-${i}`}
          type="button"
          onClick={() => onSelect(i)}
          className={`h-1.5 rounded-full transition-all ${
            i === activeIndex ? 'bg-foreground w-5' : 'bg-muted-foreground/30 w-1.5 hover:bg-muted-foreground/60'
          }`}
          aria-label={`Ir a imagen ${i + 1}`}
        />
      ))}
    </div>
  );
}