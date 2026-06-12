import { useState, useRef, useEffect } from 'react';
import { ChevronLeft, ChevronRight, X, Plus, Upload, Image as ImageIcon } from 'lucide-react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { api } from '@/api/client';
import ImagePickerDialog from './ImagePickerDialog';

/**
 * Campo de carrusel de imágenes.
 *
 * Diseño:
 *  - El slot "+" NO ocupa espacio en el carrusel. Es un botón flotante
 *    (esquina inferior derecha) que siempre está disponible para agregar
 *    más imágenes. Esto permite que la imagen actual se vea a tamaño
 *    completo.
 *  - Las flechas y dots solo aparecen cuando hay más de 1 imagen real
 *    (excluyendo el slot "+" del conteo).
 *  - Cada imagen ocupa 100% del ancho. Transform medido en píxeles
 *    (callback ref + ResizeObserver) para evitar ambigüedades con %
 *    del track.
 *
 * Funciones:
 *  - Subir nuevas imágenes (file input)
 *  - Elegir imágenes del sistema (bucket 'banners')
 *  - Eliminar imágenes (botón X en hover)
 *  - Navegar con flechas, dots, o arrastrar (touch + mouse)
 */
export default function ImageCarouselField({ imageUrls = [], onChange, disabled = false }) {
  const [activeIndex, setActiveIndex] = useState(0);
  const [uploading, setUploading] = useState(false);
  const [dragOffset, setDragOffset] = useState(0);
  const [isDragging, setIsDragging] = useState(false);
  const [viewportWidth, setViewportWidth] = useState(0);

  const startXRef = useRef(0);
  const fileInputRef = useRef(null);
  const roRef = useRef(null);

  const urls = imageUrls || [];
  const hasImages = urls.length > 0;
  const totalSlots = urls.length; // ← solo imágenes, sin el "+"

  // ── Medir el viewport en píxeles (callback ref) ──
  // Usamos callback ref en vez de useLayoutEffect porque el div del
  // viewport se monta de forma condicional (solo si hasImages). El
  // callback se ejecuta cada vez que el div aparece, así garantizamos
  // que viewportWidth sea correcto desde el primer render.
  const setViewportRef = (el) => {
    if (roRef.current) {
      roRef.current.disconnect();
      roRef.current = null;
    }
    if (el) {
      setViewportWidth(el.clientWidth);
      // Re-medir tras 1 frame por si el dialog aún está animando
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

  // Si nos quedamos sin imágenes y borramos la última, reset índice
  useEffect(() => {
    if (activeIndex >= totalSlots) setActiveIndex(Math.max(0, totalSlots - 1));
  }, [totalSlots, activeIndex]);

  // Limpiar ResizeObserver al desmontar
  useEffect(() => {
    return () => { if (roRef.current) roRef.current.disconnect(); };
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
      setActiveIndex(next.length - 1); // saltar a la nueva
      setUploading(false);
      toast.success('Imagen subida');
    } catch (err) {
      setUploading(false);
      toast.error(err.message || 'Error al subir la imagen. Verifica que el bucket "banners" exista en Supabase.');
    } finally {
      e.target.value = '';
    }
  };

  // ─── Acciones del carrusel ────────────────────────────────
  const goTo = (i) => setActiveIndex(Math.max(0, Math.min(totalSlots - 1, i)));
  const prev = () => goTo(activeIndex - 1);
  const next = () => goTo(activeIndex + 1);

  const removeAt = (i) => {
    const next = urls.filter((_, idx) => idx !== i);
    onChange(next);
    if (activeIndex >= next.length) {
      setActiveIndex(Math.max(0, next.length - 1));
    } else if (activeIndex > i) {
      setActiveIndex(activeIndex - 1);
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
    const next = [...urls, url];
    onChange(next);
    setActiveIndex(next.length - 1);
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

  // Transform en píxeles exactos
  const translatePx = -activeIndex * viewportWidth + dragOffset;

  return (
    <div className="space-y-2">
      {/* ── Viewport del carrusel ── */}
      <div
        ref={setViewportRef}
        className="relative w-full h-56 sm:h-64 rounded-lg overflow-hidden border border-border bg-muted/40 select-none"
        onMouseDown={onPointerDown}
        onMouseMove={onPointerMove}
        onMouseUp={onPointerUp}
        onMouseLeave={onPointerUp}
        onTouchStart={onPointerDown}
        onTouchMove={onPointerMove}
        onTouchEnd={onPointerUp}
      >
        {/* ── Si NO hay imágenes, mostrar el placeholder grande de "+" ── */}
        {!hasImages && (
          <div className="absolute inset-0 flex flex-col items-center justify-center gap-2 bg-muted/30 border-2 border-dashed border-border">
            <Plus className="w-12 h-12 text-muted-foreground/40" />
            <p className="text-sm text-muted-foreground">Aún no has agregado imágenes</p>
            <div className="flex gap-1.5 mt-1">
              <Button
                type="button"
                size="sm"
                variant="outline"
                onClick={() => fileInputRef.current?.click()}
                disabled={uploading || disabled}
                className="h-8 text-xs gap-1"
              >
                <Upload className="w-3.5 h-3.5" /> Subir imagen
              </Button>
              <ImagePickerDialog
                onSelect={(url) => handleSystemPick(url)}
                trigger={
                  <Button
                    type="button"
                    size="sm"
                    variant="outline"
                    disabled={disabled}
                    className="h-8 text-xs gap-1"
                  >
                    <ImageIcon className="w-3.5 h-3.5" /> Del sistema
                  </Button>
                }
              />
            </div>
            {uploading && <p className="text-[10px] text-muted-foreground">Subiendo...</p>}
          </div>
        )}

        {/* ── Track con las imágenes (solo si hay al menos 1) ── */}
        {hasImages && (
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
                key={`img-${i}-${url.slice(-12)}`}
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
                    onClick={(e) => { e.stopPropagation(); removeAt(i); }}
                    className="absolute top-2 right-2 w-7 h-7 rounded-full bg-black/60 text-white flex items-center justify-center opacity-70 hover:opacity-100 hover:bg-destructive transition-all"
                    aria-label="Eliminar imagen"
                  >
                    <X className="w-3.5 h-3.5" />
                  </button>
                )}
              </div>
            ))}
          </div>
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
              onSelect={(url) => handleSystemPick(url)}
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

        {/* Flechas (solo si hay más de 1 imagen) */}
        {hasImages && totalSlots > 1 && (
          <>
            <button
              type="button"
              onClick={(e) => { e.stopPropagation(); prev(); }}
              disabled={activeIndex === 0}
              className="absolute left-2 top-1/2 -translate-y-1/2 w-8 h-8 rounded-full bg-black/60 text-white flex items-center justify-center disabled:opacity-30 hover:bg-black/80 transition-all"
              aria-label="Imagen anterior"
            >
              <ChevronLeft className="w-4 h-4" />
            </button>
            <button
              type="button"
              onClick={(e) => { e.stopPropagation(); next(); }}
              disabled={activeIndex >= totalSlots - 1}
              className="absolute right-2 top-1/2 -translate-y-1/2 w-8 h-8 rounded-full bg-black/60 text-white flex items-center justify-center disabled:opacity-30 hover:bg-black/80 transition-all"
              aria-label="Siguiente imagen"
            >
              <ChevronRight className="w-4 h-4" />
            </button>
          </>
        )}

        {/* Hint de arrastre */}
        {hasImages && totalSlots > 1 && !isDragging && dragOffset === 0 && (
          <div className="absolute top-2 left-1/2 -translate-x-1/2 px-2 py-0.5 rounded-full bg-black/40 text-white text-[9px] pointer-events-none">
            Desliza o usa las flechas
          </div>
        )}
      </div>

      {/* ── Dots (solo si hay más de 1 imagen) ── */}
      {hasImages && totalSlots > 1 && (
        <div className="flex items-center justify-center gap-1.5">
          {Array.from({ length: totalSlots }).map((_, i) => (
            <button
              key={`dot-${i}`}
              type="button"
              onClick={() => goTo(i)}
              className={`h-1.5 rounded-full transition-all ${
                i === activeIndex ? 'bg-foreground w-5' : 'bg-muted-foreground/30 w-1.5 hover:bg-muted-foreground/60'
              }`}
              aria-label={`Ir a imagen ${i + 1}`}
            />
          ))}
        </div>
      )}

      {/* File input oculto */}
      <input
        ref={fileInputRef}
        type="file"
        accept="image/*"
        onChange={handleUpload}
        disabled={uploading || disabled}
        className="hidden"
      />

      {/* Texto de ayuda */}
      <p className="text-[11px] text-muted-foreground">
        {hasImages
          ? 'La primera imagen es la principal. Usa las flechas, los puntos o desliza para navegar entre imágenes.'
          : 'Sube una imagen o elige una del sistema. Puedes agregar más después.'}
      </p>
    </div>
  );
}
