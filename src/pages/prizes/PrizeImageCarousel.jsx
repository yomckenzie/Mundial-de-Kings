import { ChevronLeft, ChevronRight, Maximize2 } from 'lucide-react';

/**
 * Header del Premio: carrusel de imágenes con dots, flechas y botón maximizar.
 * Si no hay imagen real, muestra el degradado + emoji del premio.
 *
 * Las props son las que necesita PrizeCard para el control del carrusel y
 * la apertura del lightbox.
 */
export function PrizeImageCarousel({
  hasRealImage,
  imageList,
  totalImgs,
  safeIdx,
  viewportWidth,
  dragOffset,
  isDragging,
  gradient,
  prizeName,
  onPointerDown,
  onPointerMove,
  onPointerUp,
  onPrev,
  onNext,
  onSelectDot,
  onOpenLightbox,
}) {
  if (!hasRealImage) {
    return (
      <>
        {/* Círculos decorativos */}
        <div className="absolute w-32 h-32 rounded-full bg-white/5 -top-8 -right-8" />
        <div className="absolute w-24 h-24 rounded-full bg-white/5 -bottom-6 -left-6" />
        <div className="absolute w-16 h-16 rounded-full bg-white/10 top-4 left-4" />
        <span className="text-7xl select-none relative z-10 transform group-hover:scale-110 group-hover:rotate-6 transition-all duration-300">
          🎁
        </span>
        <div className="absolute inset-0 bg-gradient-to-t from-black/20 to-transparent opacity-0 group-hover:opacity-100 transition-opacity duration-300" />
      </>
    );
  }

  return (
    <>
      <div
        className="flex w-full h-full"
        style={{
          width: `${totalImgs * 100}%`,
          transform: `translateX(${-safeIdx * viewportWidth + dragOffset}px)`,
          transition: isDragging ? 'none' : 'transform 320ms cubic-bezier(0.22, 1, 0.36, 1)',
          cursor: isDragging ? 'grabbing' : (totalImgs > 1 ? 'grab' : 'default'),
        }}
      >
        {imageList.map((url, i) => (
          <div
            key={`${i}-${url.slice(-12)}`}
            className="h-full shrink-0"
            style={{ width: `${100 / totalImgs}%` }}
          >
            <img
              src={url}
              alt={`${prizeName} - ${i + 1}`}
              className="w-full h-full object-cover pointer-events-none group-hover:scale-105 transition-transform duration-500 ease-out"
              loading="lazy"
              draggable={false}
            />
          </div>
        ))}
      </div>
      <div className="absolute inset-0 bg-gradient-to-t from-black/30 to-transparent pointer-events-none" />
      {totalImgs > 1 && (
        <>
          <button
            type="button"
            onClick={(e) => { e.stopPropagation(); onPrev(); }}
            className="absolute left-2 top-1/2 -translate-y-1/2 w-7 h-7 rounded-full bg-black/40 text-white flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity hover:bg-black/70"
            aria-label="Imagen anterior"
          >
            <ChevronLeft className="w-3.5 h-3.5" />
          </button>
          <button
            type="button"
            onClick={(e) => { e.stopPropagation(); onNext(); }}
            className="absolute right-2 top-1/2 -translate-y-1/2 w-7 h-7 rounded-full bg-black/40 text-white flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity hover:bg-black/70"
            aria-label="Siguiente imagen"
          >
            <ChevronRight className="w-3.5 h-3.5" />
          </button>
          <div className="absolute bottom-2 left-1/2 -translate-x-1/2 flex gap-1">
            {imageList.map((url, i) => (
              <button
                key={`d-${url}`}
                type="button"
                onClick={(e) => { e.stopPropagation(); onSelectDot(i); }}
                className={`h-1 rounded-full transition-all ${
                  i === safeIdx ? 'bg-white w-4' : 'bg-white/40 w-1 hover:bg-white/70'
                }`}
                aria-label={`Ir a imagen ${i + 1}`}
              />
            ))}
          </div>
        </>
      )}
      {hasRealImage && (
        <button
          type="button"
          onClick={(e) => {
            e.stopPropagation();
            onOpenLightbox();
          }}
          className="absolute top-2 left-2 w-8 h-8 rounded-full bg-black/60 text-white flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity hover:bg-black/80"
          aria-label="Ver imagen en grande"
        >
          <Maximize2 className="w-4 h-4" />
        </button>
      )}
    </>
  );
}