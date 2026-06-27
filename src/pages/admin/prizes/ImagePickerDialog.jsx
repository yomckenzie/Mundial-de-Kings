import { useState, useReducer, useRef, useEffect } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogTrigger } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Image as ImageIcon, RefreshCw, Search, ChevronLeft, ChevronRight } from 'lucide-react';
import { toast } from 'sonner';
import { api } from '@/api/client';
import { ImagePickerItem } from './ImagePickerItem';

/**
 * ImagePickerDialog — galería de imágenes del bucket 'banners'.
 * Vista en CARRUSEL: una imagen a la vez, con flechas, dots y swipe.
 * Paginación conservada (24 imágenes por página) y búsqueda por nombre.
 *
 * Estado interno consolidado con useReducer para evitar renders múltiples
 * al actualizar campos relacionados (imágenes + loading + page + search).
 * `open` queda como useState porque Radix Dialog lo controla.
 */

const IMAGE_PICKER_INITIAL = { images: [], loading: false, search: '', page: 1 };
const PAGE_SIZE = 24;

function imagePickerReducer(state, action) {
  switch (action.type) {
    case 'LOAD_START':
      return { ...state, loading: true };
    case 'LOAD_SUCCESS':
      return { ...state, loading: false, images: action.images, page: 1 };
    case 'LOAD_ERROR':
      return { ...state, loading: false };
    case 'SET_SEARCH':
      return { ...state, search: action.value, page: 1, activeIndex: 0 };
    case 'CLEAR_SEARCH':
      return { ...state, search: '', page: 1, activeIndex: 0 };
    case 'SET_PAGE':
      return { ...state, page: action.value, activeIndex: 0 };
    case 'SET_ACTIVE':
      return { ...state, activeIndex: action.value };
    case 'RESET':
      return IMAGE_PICKER_INITIAL;
    default:
      return state;
  }
}

export default function ImagePickerDialog({ onSelect, trigger }) {
  const [open, setOpen] = useState(false);
  const [state, dispatch] = useReducer(imagePickerReducer, { ...IMAGE_PICKER_INITIAL, activeIndex: 0 });
  const { images, loading, search, page, activeIndex } = state;

  // ── Drag/swipe ──
  const [dragOffset, setDragOffset] = useState(0);
  const [isDragging, setIsDragging] = useState(false);
  const [viewportWidth, setViewportWidth] = useState(0);
  const viewportRef = useRef(null);
  const startXRef = useRef(0);

  // Medir el viewport en píxeles para calcular el transform correctamente.
  // El <div ref={viewportRef}> se monta de forma condicional (solo cuando
  // hay imágenes y no está cargando), así que medimos CADA VEZ que se
  // monta. Usamos un ref-callback en lugar de useLayoutEffect para
  // garantizar la medición apenas aparece el div.
  const setViewportRef = (el) => {
    viewportRef.current = el;
    if (el) {
      setViewportWidth(el.clientWidth);
      // Re-medir en el siguiente frame por si el dialog aún está animando
      requestAnimationFrame(() => {
        if (viewportRef.current) {
          setViewportWidth(viewportRef.current.clientWidth);
        }
      });
    }
  };

  // Reset offset si cambia el set mostrado
  useEffect(() => {
    setDragOffset(0);
    setIsDragging(false);
  }, [activeIndex, page, search]);

  const loadImages = async () => {
    dispatch({ type: 'LOAD_START' });
    try {
      const list = await api.integrations.Core.ListFiles({ bucket: 'banners' });
      // Ordenar por fecha (más recientes primero). toSorted() es ES2023 y no muta
      // el array original (a diferencia de .sort() que requiere spread copy).
      const sorted = (list || []).toSorted((a, b) => {
        const da = new Date(a.created_at || 0).getTime();
        const db = new Date(b.created_at || 0).getTime();
        return db - da;
      });
      dispatch({ type: 'LOAD_SUCCESS', images: sorted });
    } catch {
      dispatch({ type: 'LOAD_ERROR' });
      toast.error('Error al cargar las imágenes del sistema');
    }
  };

  const handleOpenChange = (o) => {
    setOpen(o);
    if (o) loadImages();
    if (!o) dispatch({ type: 'RESET' });
  };

  const handleSelect = (url, name) => {
    // El callback puede devolver `false` para señalar que la URL no se
    // aceptó (p.ej. duplicado en el carrusel). En ese caso NO cerramos
    // ni toastamos — el consumidor maneja el feedback.
    const accepted = onSelect(url);
    if (accepted === false) return;
    setOpen(false);
    toast.success(`Imagen "${name}" seleccionada`);
  };

  // Filtrar por búsqueda
  const filtered = search.trim()
    ? images.filter(img => (img.name || '').toLowerCase().includes(search.toLowerCase()))
    : images;

  // Paginación
  const totalPages = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE));
  const safePage = Math.min(page, totalPages);
  const startIdx = (safePage - 1) * PAGE_SIZE;
  const pageItems = filtered.slice(startIdx, startIdx + PAGE_SIZE);
  const totalInPage = pageItems.length;

  // ── Navegación del carrusel (dentro de la página actual) ──
  const safeIndex = Math.min(activeIndex, Math.max(0, totalInPage - 1));
  const goTo = (i) => dispatch({ type: 'SET_ACTIVE', value: Math.max(0, Math.min(totalInPage - 1, i)) });
  const prev = () => goTo(safeIndex - 1);
  const next = () => goTo(safeIndex + 1);

  const onPointerDown = (e) => {
    if (totalInPage <= 1) return;
    setIsDragging(true);
    startXRef.current = e.clientX ?? e.touches?.[0]?.clientX ?? 0;
  };
  const onPointerMove = (e) => {
    if (!isDragging) return;
    const x = e.clientX ?? e.touches?.[0]?.clientX ?? 0;
    setDragOffset(Math.max(-200, Math.min(200, x - startXRef.current)));
  };
  const onPointerUp = () => {
    if (!isDragging) return;
    setIsDragging(false);
    if (Math.abs(dragOffset) > 60) {
      if (dragOffset < 0) next();
      else prev();
    }
    setDragOffset(0);
  };

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogTrigger asChild>
        {trigger ?? (
          <Button type="button" variant="outline" size="sm" className="gap-1.5 shrink-0">
            <ImageIcon className="w-4 h-4" />
            Sistema
          </Button>
        )}
      </DialogTrigger>
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <ImageIcon className="w-5 h-5" />
            Imágenes del sistema
          </DialogTitle>
          <DialogDescription>
            Selecciona una imagen ya subida al sistema. También puedes subir una nueva usando el botón "Subir archivo" del formulario.
          </DialogDescription>
        </DialogHeader>

        {/* Barra de búsqueda + acciones */}
        <div className="flex items-center gap-2 mb-3">
          <div className="relative flex-1">
            <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-muted-foreground pointer-events-none" />
            <Input
              placeholder="Buscar por nombre..."
              value={search}
              onChange={(e) => dispatch({ type: 'SET_SEARCH', value: e.target.value })}
              className="pl-8 h-9 text-sm"
            />
          </div>
          <Button type="button" variant="ghost" size="sm" onClick={loadImages} disabled={loading} className="gap-1.5 h-9 text-xs shrink-0">
            <RefreshCw className={`w-3.5 h-3.5 ${loading ? 'animate-spin' : ''}`} />
            Refrescar
          </Button>
        </div>

        {/* Contador */}
        {!loading && (
          <p className="text-xs text-muted-foreground mb-2">
            {filtered.length === images.length
              ? `${images.length} imagen${images.length === 1 ? '' : 'es'} en total`
              : `${filtered.length} de ${images.length} imagen${images.length === 1 ? '' : 'es'}`
            }
          </p>
        )}

        {loading ? (
          <div className="w-full h-72 rounded-lg bg-muted animate-pulse" />
        ) : images.length === 0 ? (
          <div className="text-center py-16 space-y-2">
            <ImageIcon className="w-12 h-12 text-muted-foreground/30 mx-auto" />
            <p className="text-sm text-muted-foreground">No hay imágenes en el sistema.</p>
            <p className="text-xs text-muted-foreground/60">Sube una imagen usando el botón "Subir archivo" del formulario.</p>
          </div>
        ) : filtered.length === 0 ? (
          <div className="text-center py-16 space-y-2">
            <Search className="w-10 h-10 text-muted-foreground/30 mx-auto" />
            <p className="text-sm text-muted-foreground">Sin resultados para "{search}"</p>
            <Button variant="ghost" size="sm" onClick={() => dispatch({ type: 'CLEAR_SEARCH' })}>Limpiar búsqueda</Button>
          </div>
        ) : (
          <>
            {/* ── Viewport del carrusel ── */}
            <div
              ref={setViewportRef}
              aria-roledescription="carrusel"
              aria-label="Carrusel de imágenes arrastrable"
              role="application"
              className="relative w-full h-72 rounded-xl overflow-hidden border border-border bg-card select-none"
              onMouseDown={onPointerDown}
              onMouseMove={onPointerMove}
              onMouseUp={onPointerUp}
              onMouseLeave={onPointerUp}
              onTouchStart={onPointerDown}
              onTouchMove={onPointerMove}
              onTouchEnd={onPointerUp}
            >
              <div
                className="flex h-full"
                style={{
                  width: `${totalInPage * 100}%`,
                  transform: `translateX(${-safeIndex * viewportWidth + dragOffset}px)`,
                  transition: isDragging ? 'none' : 'transform 320ms cubic-bezier(0.22, 1, 0.36, 1)',
                  cursor: isDragging ? 'grabbing' : (totalInPage > 1 ? 'grab' : 'default'),
                }}
              >
                {pageItems.map((img, i) => (
                  <div
                    key={img.id || img.name}
                    style={{ width: `${100 / totalInPage}%` }}
                    className="h-full shrink-0"
                  >
                    <ImagePickerItem
                      img={img}
                      onSelect={handleSelect}
                    />
                  </div>
                ))}
              </div>

              {/* Flechas */}
              {totalInPage > 1 && (
                <>
                  <button
                    type="button"
                    onClick={(e) => { e.stopPropagation(); prev(); }}
                    disabled={safeIndex === 0}
                    className="absolute left-2 top-1/2 -translate-y-1/2 w-9 h-9 rounded-full bg-black/60 text-white flex items-center justify-center disabled:opacity-30 hover:bg-black/80 transition-all"
                    aria-label="Imagen anterior"
                  >
                    <ChevronLeft className="w-4 h-4" />
                  </button>
                  <button
                    type="button"
                    onClick={(e) => { e.stopPropagation(); next(); }}
                    disabled={safeIndex >= totalInPage - 1}
                    className="absolute right-2 top-1/2 -translate-y-1/2 w-9 h-9 rounded-full bg-black/60 text-white flex items-center justify-center disabled:opacity-30 hover:bg-black/80 transition-all"
                    aria-label="Siguiente imagen"
                  >
                    <ChevronRight className="w-4 h-4" />
                  </button>
                </>
              )}

              {/* Contador "X de N" arriba a la izquierda */}
              {totalInPage > 1 && (
                <div className="absolute top-2 left-2 px-2 py-0.5 rounded-full bg-black/60 text-white text-[10px] font-medium">
                  {safeIndex + 1} / {totalInPage}
                </div>
              )}
            </div>

            {/* Dots */}
            {totalInPage > 1 && totalInPage <= 12 && (
              <div className="flex items-center justify-center gap-1.5 mt-3">
                {Array.from({ length: totalInPage }).map((_, i) => (
                  <button
                    key={`dot-${i}`}
                    type="button"
                    onClick={() => goTo(i)}
                    className={`h-1.5 rounded-full transition-all ${
                      i === safeIndex ? 'bg-foreground w-5' : 'bg-muted-foreground/30 w-1.5 hover:bg-muted-foreground/60'
                    }`}
                    aria-label={`Ir a imagen ${i + 1}`}
                  />
                ))}
              </div>
            )}

            {/* Paginación entre páginas */}
            {totalPages > 1 && (
              <div className="flex items-center justify-between mt-3 pt-3 border-t border-border/50">
                <p className="text-xs text-muted-foreground">
                  Página {safePage} de {totalPages}
                </p>
                <div className="flex items-center gap-1">
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    onClick={() => dispatch({ type: 'SET_PAGE', value: Math.max(1, safePage - 1) })}
                    disabled={safePage === 1}
                    className="h-8 text-xs"
                  >
                    <ChevronLeft className="w-3.5 h-3.5" />
                    Anterior
                  </Button>
                  <span className="text-xs text-muted-foreground px-2">
                    {safePage} / {totalPages}
                  </span>
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    onClick={() => dispatch({ type: 'SET_PAGE', value: Math.min(totalPages, safePage + 1) })}
                    disabled={safePage === totalPages}
                    className="h-8 text-xs"
                  >
                    Siguiente
                    <ChevronRight className="w-3.5 h-3.5" />
                  </Button>
                </div>
              </div>
            )}
          </>
        )}
      </DialogContent>
    </Dialog>
  );
}
