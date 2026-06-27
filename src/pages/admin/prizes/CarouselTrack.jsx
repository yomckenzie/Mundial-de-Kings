import { X } from 'lucide-react';

/**
 * Track del carrusel: el contenedor que se desplaza con translateX en px.
 * Recibe las URLs, el offset calculado (translatePx) y callbacks.
 */
export function CarouselTrack({
  urls,
  totalSlots,
  translatePx,
  isDragging,
  disabled,
  onRemove,
}) {
  return (
    <div
      className="flex h-full"
      style={{
        width: `${totalSlots * 100}%`,
        transform: `translateX(${translatePx}px)`,
        transition: isDragging ? 'none' : 'transform 280ms cubic-bezier(0.22, 1, 0.36, 1)',
        cursor: isDragging ? 'grabbing' : (totalSlots > 1 ? 'grab' : 'default'),
      }}
    >
      {urls.map((url, i) => (
        <div
          key={url || `empty-${i}`}
          className="relative h-full bg-card shrink-0"
          style={{ width: `${100 / totalSlots}%` }}
        >
          <img
            src={url}
            alt={`Imagen ${i + 1}`}
            loading="lazy"
            decoding="async"
            draggable={false}
            className="w-full h-full object-contain pointer-events-none"
          />
          {/* Badge de posición */}
          <div className="absolute top-2 left-2 px-2 py-0.5 rounded-full bg-black/60 text-white text-[10px] font-medium">
            {i + 1} / {totalSlots}
          </div>
          {/* Botón eliminar */}
          {!disabled && (
            <button
              type="button"
              onClick={(e) => { e.stopPropagation(); onRemove(i); }}
              className="absolute top-2 right-2 w-7 h-7 rounded-full bg-black/60 text-white flex items-center justify-center opacity-70 hover:opacity-100 hover:bg-destructive transition-all"
              aria-label="Eliminar imagen"
            >
              <X className="w-3.5 h-3.5" />
            </button>
          )}
        </div>
      ))}
    </div>
  );
}