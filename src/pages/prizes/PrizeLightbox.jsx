import { ChevronLeft, ChevronRight, X } from 'lucide-react';
import { Dialog, DialogContent } from '@/components/ui/dialog';

/**
 * Lightbox: muestra la imagen del premio a pantalla completa.
 * Si hay más de una imagen muestra flechas y dots para navegar.
 */
export function PrizeLightbox({
  open,
  onClose,
  imageList,
  safeIdx,
  totalImgs,
  prizeName,
  onPrev,
  onNext,
  onSelectDot,
}) {
  const current = imageList[safeIdx];
  return (
    <Dialog open={open} onOpenChange={onClose}>
      <DialogContent className="max-w-[95vw] max-h-[95vh] p-0 bg-black/95 border-0">
        <button
          type="button"
          onClick={onClose}
          className="absolute top-3 right-3 z-50 w-10 h-10 rounded-full bg-white/10 text-white flex items-center justify-center hover:bg-white/20 transition-colors"
          aria-label="Cerrar"
        >
          <X className="w-5 h-5" />
        </button>
        {current && (
          <div className="flex items-center justify-center min-h-[60vh] p-4 relative">
            {/* Skeleton mientras carga la imagen grande */}
            <div className="absolute inset-4 flex items-center justify-center">
              <div className="w-12 h-12 rounded-full border-4 border-white/20 border-t-white/80 animate-spin" />
            </div>
            <img
              src={current}
              alt={prizeName}
              loading="eager"
              decoding="sync"
              className="max-w-full max-h-[85vh] object-contain relative z-10"
              onLoad={(e) => { e.currentTarget.style.opacity = '1'; }}
              style={{ opacity: 0, transition: 'opacity 250ms' }}
            />
          </div>
        )}
        {totalImgs > 1 && (
          <>
            <button
              type="button"
              onClick={onPrev}
              className="absolute left-3 top-1/2 -translate-y-1/2 w-10 h-10 rounded-full bg-white/10 text-white flex items-center justify-center hover:bg-white/20"
              aria-label="Imagen anterior"
            >
              <ChevronLeft className="w-5 h-5" />
            </button>
            <button
              type="button"
              onClick={onNext}
              className="absolute right-3 top-1/2 -translate-y-1/2 w-10 h-10 rounded-full bg-white/10 text-white flex items-center justify-center hover:bg-white/20"
              aria-label="Siguiente imagen"
            >
              <ChevronRight className="w-5 h-5" />
            </button>
            <div className="absolute bottom-3 left-1/2 -translate-x-1/2 flex gap-1.5">
              {imageList.map((url, i) => (
                <button
                  key={`ld-${url}`}
                  type="button"
                  onClick={() => onSelectDot(i)}
                  className={`h-1.5 rounded-full transition-all ${
                    i === safeIdx ? 'bg-white w-6' : 'bg-white/40 w-1.5 hover:bg-white/70'
                  }`}
                  aria-label={`Ir a imagen ${i + 1}`}
                />
              ))}
            </div>
          </>
        )}
      </DialogContent>
    </Dialog>
  );
}