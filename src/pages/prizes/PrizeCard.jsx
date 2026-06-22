import { useState, useRef, useEffect } from 'react';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Dialog, DialogContent } from '@/components/ui/dialog';
import { Package, Ruler, Sparkles, Loader2, ChevronLeft, ChevronRight, Maximize2, X } from 'lucide-react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { api } from '@/api/client';
import { useOutletContext } from 'react-router-dom';
import { toast } from 'sonner';
import { useNavigate } from 'react-router-dom';
import RedemptionSuccessDialog from './RedemptionSuccessDialog';
import RedemptionVerifyDialog from './RedemptionVerifyDialog';

export default function PrizeCard({ prize, availablePoints = 0 }) {
  const { user } = useOutletContext();
  const queryClient = useQueryClient();
  const navigate = useNavigate();
  const [verifyOpen, setVerifyOpen] = useState(false);
  const [successPrize, setSuccessPrize] = useState(null);
  const hasSizes = prize.sizes && typeof prize.sizes === 'object' && Object.keys(prize.sizes).length > 0;
  const [imgError, setImgError] = useState(false);
  const [selectedSize, setSelectedSize] = useState(null);
  const [lightboxOpen, setLightboxOpen] = useState(false);
  const gradient = prize.gradient || 'from-slate-600 to-slate-800';

  // Lista de imágenes: preferir image_urls (nuevo formato) y caer a image_url (legacy)
  const imageList = Array.isArray(prize.image_urls) && prize.image_urls.length > 0
    ? prize.image_urls
    : (prize.image_url ? [prize.image_url] : []);
  const hasRealImage = imageList.length > 0 && !imgError;
  const [activeImg, setActiveImg] = useState(0);
  const [dragOffset, setDragOffset] = useState(0);
  const [isDragging, setIsDragging] = useState(false);
  const [viewportWidth, setViewportWidth] = useState(0);
  const startXRef = useRef(0);
  const roRef = useRef(null);
  const totalImgs = imageList.length;

  // Medir el viewport en píxeles (callback ref). El contenedor se monta
  // solo si hay imagen real, así que medimos en cuanto aparece.
  const setViewportRef = (el) => {
    if (roRef.current) { roRef.current.disconnect(); roRef.current = null; }
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

  useEffect(() => {
    return () => { if (roRef.current) roRef.current.disconnect(); };
  }, []);

  useEffect(() => {
    if (activeImg >= totalImgs) setActiveImg(0);
  }, [totalImgs, activeImg]);

  const prevImg = () => setActiveImg(i => (i - 1 + totalImgs) % totalImgs);
  const nextImg = () => setActiveImg(i => (i + 1) % totalImgs);

  // Distingue click de drag: si el cursor se movió menos de 5px entre
  // pointerdown y pointerup, es un click → abrir lightbox. Si se movió más,
  // fue un drag → cambiar de imagen del carrusel.
  // Para imágenes únicas (sin carrusel), siempre es click → lightbox.
  const clickIntentRef = useRef({ startX: 0, startY: 0, isClick: true });
  const onPointerDown = (e) => {
    setIsDragging(true);
    const x = e.clientX ?? e.touches?.[0]?.clientX ?? 0;
    const y = e.clientY ?? e.touches?.[0]?.clientY ?? 0;
    startXRef.current = x;
    clickIntentRef.current = { startX: x, startY: y, isClick: true };
  };
  const onPointerMove = (e) => {
    if (!isDragging) return;
    const x = e.clientX ?? e.touches?.[0]?.clientX ?? 0;
    const y = e.clientY ?? e.touches?.[0]?.clientY ?? 0;
    const dx = Math.abs(x - clickIntentRef.current.startX);
    const dy = Math.abs(y - clickIntentRef.current.startY);
    if (dx > 5 || dy > 5) {
      clickIntentRef.current.isClick = false;
    }
    setDragOffset(Math.max(-200, Math.min(200, x - startXRef.current)));
  };
  const onPointerUp = () => {
    if (!isDragging) return;
    setIsDragging(false);
    if (clickIntentRef.current.isClick) {
      // No fue drag → es un click → abrir lightbox con la imagen actual
      if (hasRealImage && imageList[activeImg]) {
        setLightboxOpen(true);
      }
    } else if (totalImgs > 1 && Math.abs(dragOffset) > 50) {
      // Fue drag → cambiar imagen (solo si hay carrusel)
      if (dragOffset < 0) nextImg();
      else prevImg();
    }
    setDragOffset(0);
  };

  // Mutation de canje. Descuenta puntos del user y crea un redemption pending.
  // El admin aprueba/rechaza desde /admin/redemptions.
  const redeemMutation = useMutation({
    mutationFn: async () => {
      const pointsCost = Number(prize.points_cost) || 0;
      // Validación defensiva contra doble clic / canjes repetidos:
      // availablePoints ya descuenta los canjes activos (pending/approved/delivered).
      if (pointsCost > availablePoints) {
        throw new Error('No tienes suficientes puntos disponibles. Tus puntos están reservados en canjes pendientes.');
      }
      if ((Number(prize.units_available) || 0) <= 0) {
        throw new Error('Este premio está agotado o reservado por otros canjes.');
      }
      // Canje atómico: la validación final de stock y puntos ocurre en
      // Postgres (función redeem_prize) dentro de una transacción con lock.
      // Si otro usuario canjeó la última unidad un instante antes, el
      // servidor responde OUT_OF_STOCK y aquí NO se crea nada.
      return api.entities.Redemption.redeem({
        prizeId: prize.id,
        userEmail: user.email,
        selectedSize: hasSizes ? selectedSize : null,
      });
    },
    onSuccess: () => {
      // 'prizes-public' y 'redemptions-public' son los que usa la página
      // Premios — sin invalidarlos, el saldo/stock no se actualizaba hasta recargar.
      queryClient.invalidateQueries({ queryKey: ['prizes-public'] });
      queryClient.invalidateQueries({ queryKey: ['redemptions-public'] });
      queryClient.invalidateQueries({ queryKey: ['prizes'] });
      queryClient.invalidateQueries({ queryKey: ['admin-prizes'] });
      queryClient.invalidateQueries({ queryKey: ['my-redemptions', user?.email] });
      queryClient.invalidateQueries({ queryKey: ['admin-redemptions'] });
      queryClient.invalidateQueries({ queryKey: ['admin-prizes-redemptions'] });
      setVerifyOpen(false);
      setSuccessPrize(prize.name);
      setSelectedSize(null);
    },
    onError: (err) => toast.error('Error al canjear: ' + (err.message || 'Error')),
  });
  const emoji = prize.icon || '🎁';

  return (
    <Card className="overflow-hidden h-full flex flex-col group border-0 shadow-md hover:shadow-xl transition-shadow duration-300">
      {/* Header con carrusel de imágenes o fallback degradado+emoji */}
      <div
        ref={setViewportRef}
        className={`relative aspect-video w-full overflow-hidden ${
          !hasRealImage ? `bg-gradient-to-br ${gradient} flex items-center justify-center` : ''
        } ${hasRealImage ? 'cursor-zoom-in' : ''}`}
        onMouseDown={onPointerDown}
        onMouseMove={onPointerMove}
        onMouseUp={onPointerUp}
        onMouseLeave={onPointerUp}
        onTouchStart={onPointerDown}
        onTouchMove={onPointerMove}
        onTouchEnd={onPointerUp}
      >
        {hasRealImage ? (
          <>
            <div
              className="flex w-full h-full"
              style={{
                width: `${totalImgs * 100}%`,
                transform: `translateX(${-activeImg * viewportWidth + dragOffset}px)`,
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
                    alt={`${prize.name} - ${i + 1}`}
                    className="w-full h-full object-cover pointer-events-none group-hover:scale-105 transition-transform duration-500 ease-out"
                    onError={i === 0 ? () => setImgError(true) : undefined}
                    loading="lazy"
                    draggable={false}
                  />
                </div>
              ))}
            </div>
            {/* Overlay sutil en la parte inferior */}
            <div className="absolute inset-0 bg-gradient-to-t from-black/30 to-transparent pointer-events-none" />
            {/* Flechas */}
            {totalImgs > 1 && (
              <>
                <button
                  type="button"
                  onClick={(e) => { e.stopPropagation(); prevImg(); }}
                  className="absolute left-2 top-1/2 -translate-y-1/2 w-7 h-7 rounded-full bg-black/40 text-white flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity hover:bg-black/70"
                  aria-label="Imagen anterior"
                >
                  <ChevronLeft className="w-3.5 h-3.5" />
                </button>
                <button
                  type="button"
                  onClick={(e) => { e.stopPropagation(); nextImg(); }}
                  className="absolute right-2 top-1/2 -translate-y-1/2 w-7 h-7 rounded-full bg-black/40 text-white flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity hover:bg-black/70"
                  aria-label="Siguiente imagen"
                >
                  <ChevronRight className="w-3.5 h-3.5" />
                </button>
                {/* Dots */}
                <div className="absolute bottom-2 left-1/2 -translate-x-1/2 flex gap-1">
                  {imageList.map((_, i) => (
                    <button
                      key={`d-${i}`}
                      type="button"
                      onClick={(e) => { e.stopPropagation(); setActiveImg(i); }}
                      className={`h-1 rounded-full transition-all ${
                        i === activeImg ? 'bg-white w-4' : 'bg-white/40 w-1 hover:bg-white/70'
                      }`}
                      aria-label={`Ir a imagen ${i + 1}`}
                    />
                  ))}
                </div>
              </>
            )}
            {/* Botón maximizar — abre lightbox (funciona para 1 o varias imagenes) */}
            {hasRealImage && (
              <button
                type="button"
                onClick={(e) => {
                  e.stopPropagation();
                  if (imageList[activeImg]) setLightboxOpen(true);
                }}
                className="absolute top-2 left-2 w-8 h-8 rounded-full bg-black/60 text-white flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity hover:bg-black/80"
                aria-label="Ver imagen en grande"
              >
                <Maximize2 className="w-4 h-4" />
              </button>
            )}
          </>
        ) : (
          <>
            {/* Círculos decorativos */}
            <div className="absolute w-32 h-32 rounded-full bg-white/5 -top-8 -right-8" />
            <div className="absolute w-24 h-24 rounded-full bg-white/5 -bottom-6 -left-6" />
            <div className="absolute w-16 h-16 rounded-full bg-white/10 top-4 left-4" />

            {/* Emoji */}
            <span className="text-7xl select-none relative z-10 transform group-hover:scale-110 group-hover:rotate-6 transition-all duration-300">
              {emoji}
            </span>

            {/* Brillo al hover */}
            <div className="absolute inset-0 bg-gradient-to-t from-black/20 to-transparent opacity-0 group-hover:opacity-100 transition-opacity duration-300" />
          </>
        )}

        {/* Points badge absoluto arriba a la derecha */}
        <Badge
          variant="secondary"
          className="absolute top-3 right-3 text-xs font-bold bg-gradient-to-r from-amber-400 to-amber-600 text-white border-0 shadow-lg"
        >
          <Sparkles className="w-3 h-3 mr-1" />
          {prize.points_cost} pts
        </Badge>
      </div>

      <CardContent className="p-4 flex flex-col flex-1">
        {/* Nombre */}
        <div className="flex items-start justify-between mb-2">
          <h3 className="font-semibold text-base">{prize.name}</h3>
        </div>

        {/* Descripción */}
        {prize.description && (
          <p className="text-sm text-muted-foreground mb-3 flex-1 leading-relaxed">
            {prize.description}
          </p>
        )}

        {/* Tallas disponibles (clickeables) */}
        {hasSizes && (
          <div className="mb-3">
            <div className="flex items-center gap-1 text-xs text-muted-foreground mb-1.5">
              <Ruler className="w-3 h-3" />
              <span>Tallas disponibles:</span>
            </div>
            <div className="flex flex-wrap gap-1.5">
              {Object.entries(prize.sizes).map(([size, stock]) => {
                const inStock = Number(stock) > 0;
                const isSelected = selectedSize === size;
                return (
                  <button
                    key={size}
                    type="button"
                    disabled={!inStock}
                    onClick={() => setSelectedSize(size)}
                    className={`text-xs px-2 py-0.5 rounded-md border transition-colors ${
                      isSelected
                        ? 'bg-foreground text-background border-foreground'
                        : inStock
                        ? 'bg-background border-border hover:border-foreground'
                        : 'opacity-50 cursor-not-allowed border-border'
                    }`}
                  >
                    {size}
                    <span className="ml-1 font-normal opacity-70">({stock})</span>
                  </button>
                );
              })}
            </div>
          </div>
        )}

        {/* Disponibilidad */}
        <div className="flex items-center gap-2 mb-3">
          <Package className="w-3.5 h-3.5 text-muted-foreground" />
          <div className="text-xs text-muted-foreground">
            {prize.units_available} {prize.units_available === 1 ? 'disponible' : 'disponibles'}
          </div>
        </div>

        {/* Mutation de canje */}
        {(() => {
          // availablePoints (no total_points): descuenta canjes activos.
          // Con total_points el usuario podía canjear varias veces seguidas
          // porque el total nunca baja al crear un canje pendiente.
          const userPoints = availablePoints;
          const canAfford = userPoints >= (prize.points_cost || 0);
          const inStock = (prize.units_available || 0) > 0;
          const needsSize = hasSizes && !selectedSize;
          const isDisabled = !user || !canAfford || !inStock || needsSize || redeemMutation.isPending;

          return (
            <Button
              className="w-full gap-1.5"
              disabled={isDisabled}
              onClick={() => {
                if (!user) { navigate('/login'); return; }
                if (needsSize) { toast.error('Selecciona una talla'); return; }
                if (!canAfford) { toast.error(`Te faltan ${prize.points_cost - userPoints} pts`); return; }
                setVerifyOpen(true);
              }}
              title={!user ? 'Inicia sesión para canjear' : needsSize ? 'Selecciona una talla' : !canAfford ? 'No tienes suficientes puntos' : 'Canjear premio'}
            >
              {redeemMutation.isPending ? (
                <><Loader2 className="w-4 h-4 animate-spin" /> Procesando...</>
              ) : !user ? (
                <><Package className="w-4 h-4" /> Inicia sesión para canjear</>
              ) : !canAfford ? (
                <><Package className="w-4 h-4" /> Te faltan {prize.points_cost - userPoints} pts</>
              ) : !inStock ? (
                <><Package className="w-4 h-4" /> Agotado</>
              ) : needsSize ? (
                <><Ruler className="w-4 h-4" /> Selecciona talla</>
              ) : (
                <><Package className="w-4 h-4" /> Canjear por {prize.points_cost} pts</>
              )}
            </Button>
          );
        })()}
      </CardContent>

      <RedemptionVerifyDialog
        open={verifyOpen}
        prize={prize}
        user={user}
        isPending={redeemMutation.isPending}
        onConfirm={() => redeemMutation.mutate()}
        onClose={() => setVerifyOpen(false)}
      />

      <RedemptionSuccessDialog
        open={!!successPrize}
        prizeName={successPrize}
        onClose={() => setSuccessPrize(null)}
      />

      {/* Lightbox: imagen a pantalla completa al click */}
      <Dialog open={lightboxOpen} onOpenChange={setLightboxOpen}>
        <DialogContent className="max-w-[95vw] max-h-[95vh] p-0 bg-black/95 border-0">
          <button
            type="button"
            onClick={() => setLightboxOpen(false)}
            className="absolute top-3 right-3 z-50 w-10 h-10 rounded-full bg-white/10 text-white flex items-center justify-center hover:bg-white/20 transition-colors"
            aria-label="Cerrar"
          >
            <X className="w-5 h-5" />
          </button>
          {hasRealImage && imageList[activeImg] && (
            <div className="flex items-center justify-center min-h-[60vh] p-4 relative">
              {/* Skeleton mientras carga la imagen grande */}
              <div className="absolute inset-4 flex items-center justify-center">
                <div className="w-12 h-12 rounded-full border-4 border-white/20 border-t-white/80 animate-spin" />
              </div>
              <img
                src={imageList[activeImg]}
                alt={prize.name}
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
                onClick={prevImg}
                className="absolute left-3 top-1/2 -translate-y-1/2 w-10 h-10 rounded-full bg-white/10 text-white flex items-center justify-center hover:bg-white/20"
                aria-label="Imagen anterior"
              >
                <ChevronLeft className="w-5 h-5" />
              </button>
              <button
                type="button"
                onClick={nextImg}
                className="absolute right-3 top-1/2 -translate-y-1/2 w-10 h-10 rounded-full bg-white/10 text-white flex items-center justify-center hover:bg-white/20"
                aria-label="Siguiente imagen"
              >
                <ChevronRight className="w-5 h-5" />
              </button>
              <div className="absolute bottom-3 left-1/2 -translate-x-1/2 flex gap-1.5">
                {imageList.map((_, i) => (
                  <button
                    key={`ld-${i}`}
                    type="button"
                    onClick={() => setActiveImg(i)}
                    className={`h-1.5 rounded-full transition-all ${
                      i === activeImg ? 'bg-white w-6' : 'bg-white/40 w-1.5 hover:bg-white/70'
                    }`}
                    aria-label={`Ir a imagen ${i + 1}`}
                  />
                ))}
              </div>
            </>
          )}
        </DialogContent>
      </Dialog>
    </Card>
  );
}
