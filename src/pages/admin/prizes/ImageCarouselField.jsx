import { useReducer, useRef, useEffect } from 'react';
import { Plus, Image as ImageIcon } from 'lucide-react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { api } from '@/api/client';
import { CarouselEmptyState } from './CarouselEmptyState';
import { CarouselTrack } from './CarouselTrack';
import { CarouselArrows, CarouselDots } from './CarouselArrows';
import ImagePickerDialog from './ImagePickerDialog';

/**
 * Campo de carrusel de imágenes.
 *
 * Diseño:
 *  - El slot "+" NO ocupa espacio en el carrusel. Es un botón flotante
 *    (esquina inferior derecha) que siempre está disponible para agregar
 *    más imágenes.
 *  - Las flechas y dots solo aparecen cuando hay más de 1 imagen real.
 *  - Cada imagen ocupa 100% del ancho. Transform medido en píxeles
 *    (callback ref + ResizeObserver) para evitar ambigüedades con %.
 *
 * Funciones:
 *  - Subir nuevas imágenes (file input)
 *  - Elegir imágenes del sistema (bucket 'banners')
 *  - Eliminar imágenes (botón X en hover)
 *  - Navegar con flechas, dots, o arrastrar (touch + mouse)
 */
const EMPTY_URLS = [];

// FIX (react-doctor): useReducer para agrupar 4 useState relacionados (activeIndex,
// dragOffset, isDragging, viewportWidth). Antes cada drag/click disparaba
// renders separados; ahora un solo dispatch → un solo render. El 5to state
// (`uploading`) queda fuera porque es ortogonal al carrusel.
const carouselReducer = (state, action) => {
  switch (action.type) {
    case 'DRAG_START': return { ...state, isDragging: true, dragOffset: 0 };
    case 'DRAG_MOVE':  return { ...state, dragOffset: action.offset };
    case 'DRAG_END':   return { ...state, isDragging: false, dragOffset: 0 };
    case 'SET_WIDTH':  return { ...state, viewportWidth: action.width };
    case 'GO':         return { ...state, activeIndex: action.index };
    case 'RESET_INDEX': return { ...state, activeIndex: 0, dragOffset: 0, isDragging: false };
    default: return state;
  }
};
const CAROUSEL_INITIAL = { activeIndex: 0, dragOffset: 0, isDragging: false, viewportWidth: 0 };

export default function ImageCarouselField({ imageUrls = EMPTY_URLS, onChange, disabled = false }) {
  const [uploading, setUploading] = useReducer((s, v) => v ? true : s, false);
  const [{ activeIndex, dragOffset, isDragging, viewportWidth }, dispatchCarousel] = useReducer(carouselReducer, CAROUSEL_INITIAL);
  const setActiveIndex = (i) => dispatchCarousel({ type: 'GO', index: typeof i === 'function' ? i(activeIndex) : i });
  const setDragOffset = (v) => dispatchCarousel({ type: 'DRAG_MOVE', offset: typeof v === 'function' ? v(dragOffset) : v });
  const setIsDragging = (v) => dispatchCarousel({ type: v ? 'DRAG_START' : 'DRAG_END' });
  const setViewportWidth = (v) => dispatchCarousel({ type: 'SET_WIDTH', width: v });

  const startXRef = useRef(0);
  const fileInputRef = useRef(null);
  const roRef = useRef(null);

  const urls = imageUrls || [];
  const hasImages = urls.length > 0;
  const totalSlots = urls.length;

  // ── Medir el viewport en píxeles (callback ref) ──
  const setViewportRef = (el) => {
    if (roRef.current) {
      roRef.current.disconnect();
      roRef.current = null;
    }
    if (el) {
      setViewportWidth(el.clientWidth);
      requestAnimationFrame(() => {
        if (el.clientWidth > 0) setViewportWidth(el.clientWidth);
      });
      const ro = new ResizeObserver(() => {
        if (el.clientWidth > 0) setViewportWidth(el.clientWidth);
      });
      ro.observe(el);
      roRef.current = ro;
    } else {
      setViewportWidth(0);
    }
  };

  const safeActiveIndex = activeIndex >= totalSlots ? Math.max(0, totalSlots - 1) : activeIndex;

  useEffect(() => {
    const ro = roRef.current;
    return () => { if (ro) ro.disconnect(); };
  }, []);

  // ─── Upload ───────────────────────────────────────────────
  const handleUpload = async (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    if (file.size > 5 * 1024 * 1024) {
      toast.error('La imagen no puede superar 5MB');
      return;
    }
    setUploading(true);
    try {
      const { file_url } = await api.integrations.Core.UploadFile({ file });
      const next = [...urls, file_url];
      onChange(next);
      setActiveIndex(next.length - 1);
      setUploading(false);
      toast.success('Imagen subida');
    } catch (err) {
      setUploading(false);
      toast.error(err.message || 'Error al subir la imagen. Verifica que el bucket "banners" exista en Supabase.');
    } finally {
      e.target.value = '';
    }
  };

  const goTo = (i) => setActiveIndex(Math.max(0, Math.min(totalSlots - 1, i)));
  const prev = () => goTo(activeIndex - 1);
  const next = () => goTo(activeIndex + 1);

  const removeAt = (i) => {
    const nextUrls = urls.filter((_, idx) => idx !== i);
    onChange(nextUrls);
    if (activeIndex >= nextUrls.length) {
      setActiveIndex(Math.max(0, nextUrls.length - 1));
    } else if (activeIndex > i) {
      setActiveIndex((prev) => Math.max(0, prev - 1));
    }
    toast.success('Imagen eliminada');
  };

  const handleSystemPick = (url) => {
    if (urls.includes(url)) {
      toast.info('Esa imagen ya está en el carrusel');
      const existingIdx = urls.indexOf(url);
      setActiveIndex(existingIdx);
      return false;
    }
    const nextUrls = [...urls, url];
    onChange(nextUrls);
    setActiveIndex(nextUrls.length - 1);
    return true;
  };

  // ─── Drag / swipe (touch + mouse) ─────────────────────────
  const onPointerDown = (e) => {
    if (totalSlots <= 1) return;
    setIsDragging(true);
    startXRef.current = e.clientX ?? e.touches?.[0]?.clientX ?? 0;
  };
  const onPointerMove = (e) => {
    if (!isDragging) return;
    const x = e.clientX ?? e.touches?.[0]?.clientX ?? 0;
    const delta = x - startXRef.current;
    setDragOffset(Math.max(-200, Math.min(200, delta)));
  };
  const onPointerUp = () => {
    if (!isDragging) return;
    setIsDragging(false);
    if (Math.abs(dragOffset) > 60) {
      if (dragOffset < 0) goTo(activeIndex + 1);
      else goTo(activeIndex - 1);
    }
    setDragOffset(0);
  };

  const translatePx = -safeActiveIndex * viewportWidth + dragOffset;

  return (
    <div className="space-y-2">
      <div
        ref={setViewportRef}
        aria-label="Carrusel de imágenes arrastrable"
        aria-roledescription="Carrusel de imágenes"
        role="application"
        className="relative w-full h-56 sm:h-64 rounded-lg overflow-hidden border border-border bg-muted/40 select-none"
        onMouseDown={onPointerDown}
        onMouseMove={onPointerMove}
        onMouseUp={onPointerUp}
        onMouseLeave={onPointerUp}
        onTouchStart={onPointerDown}
        onTouchMove={onPointerMove}
        onTouchEnd={onPointerUp}
      >
        {!hasImages && (
          <CarouselEmptyState
            uploading={uploading}
            disabled={disabled}
            onUploadClick={() => fileInputRef.current?.click()}
            onSystemPick={handleSystemPick}
          />
        )}

        {hasImages && (
          <CarouselTrack
            urls={urls}
            totalSlots={totalSlots}
            translatePx={translatePx}
            isDragging={isDragging}
            disabled={disabled}
            onRemove={removeAt}
          />
        )}

        {/* ── Botón flotante "+" (esquina inferior derecha) ── */}
        {hasImages && !disabled && (
          <div className="absolute bottom-2 right-2 flex gap-1.5 z-10">
            <button
              type="button"
              onClick={() => fileInputRef.current?.click()}
              disabled={uploading}
              className="h-8 px-2.5 rounded-md bg-black/60 hover:bg-black/80 text-white text-[11px] font-medium flex items-center gap-1 backdrop-blur-sm transition-colors"
              title="Subir otra imagen"
            >
              <Plus className="w-3.5 h-3.5" /> Agregar
            </button>
            <ImagePickerDialog
              onSelect={handleSystemPick}
              trigger={
                <button
                  type="button"
                  disabled={disabled}
                  className="h-8 px-2.5 rounded-md bg-black/60 hover:bg-black/80 text-white text-[11px] font-medium flex items-center gap-1 backdrop-blur-sm transition-colors"
                  title="Elegir del sistema"
                >
                  <ImageIcon className="w-3.5 h-3.5" />
                </button>
              }
            />
          </div>
        )}

        {hasImages && totalSlots > 1 && (
          <CarouselArrows
            canPrev={safeActiveIndex > 0}
            canNext={safeActiveIndex < totalSlots - 1}
            onPrev={prev}
            onNext={next}
          />
        )}

        {hasImages && totalSlots > 1 && !isDragging && dragOffset === 0 && (
          <div className="absolute top-2 left-1/2 -translate-x-1/2 px-2 py-0.5 rounded-full bg-black/40 text-white text-[9px] pointer-events-none">
            Desliza o usa las flechas
          </div>
        )}
      </div>

      {hasImages && totalSlots > 1 && (
        <CarouselDots total={totalSlots} activeIndex={safeActiveIndex} onSelect={goTo} />
      )}

      <input
        ref={fileInputRef}
        type="file"
        accept="image/*"
        onChange={handleUpload}
        disabled={uploading || disabled}
        aria-label="Subir imagen"
        className="hidden"
      />

      <p className="text-xs text-muted-foreground">
        {hasImages
          ? 'La primera imagen es la principal. Usa las flechas, los puntos o desliza para navegar entre imágenes.'
          : 'Sube una imagen o elige una del sistema. Puedes agregar más después.'}
      </p>
    </div>
  );
}