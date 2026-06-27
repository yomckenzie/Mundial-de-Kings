import { useState, useEffect, useRef } from 'react';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Sparkles, Package, Ruler } from 'lucide-react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { api } from '@/api/client';
import { useOutletContext } from 'react-router-dom';
import { toast } from 'sonner';
import { useNavigate } from 'react-router-dom';
import { RedeemButton } from './RedeemButton';
import { PrizeLightbox } from './PrizeLightbox';
import { PrizeImageCarousel } from './PrizeImageCarousel';
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

  // FIX (react-doctor): derivar safeIdx inline en vez de clamp via useEffect.
  // Antes: useEffect reseteaba activeImg cuando totalImgs cambiaba — mostraba
  // índice stale en el render intermedio. Ahora: activeImg puede ser mayor
  // a totalImgs (al cambiar de premio con más imágenes), pero el render usa
  // safeIdx que siempre está en rango.
  const safeIdx = totalImgs > 0 ? activeImg % totalImgs : 0;

  const prevImg = () => setActiveImg(i => (i - 1 + totalImgs) % totalImgs);
  const nextImg = () => setActiveImg(i => (i + 1) % totalImgs);

  // Distingue click de drag: si el cursor se movió menos de 5px entre
  // pointerdown y pointerup, es un click → abrir lightbox. Si se movió más,
  // fue un drag → cambiar de imagen del carrusel.
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
      if (hasRealImage && imageList[safeIdx]) {
        setLightboxOpen(true);
      }
    } else if (totalImgs > 1 && Math.abs(dragOffset) > 50) {
      if (dragOffset < 0) nextImg();
      else prevImg();
    }
    setDragOffset(0);
  };

  // Mutation de canje. Descuenta puntos del user y crea un redemption pending.
  const redeemMutation = useMutation({
    mutationFn: async () => {
      const pointsCost = Number(prize.points_cost) || 0;
      if (pointsCost > availablePoints) {
        throw new Error('No tienes suficientes puntos disponibles. Tus puntos están reservados en canjes pendientes.');
      }
      if ((Number(prize.units_available) || 0) <= 0) {
        throw new Error('Este premio está agotado o reservado por otros canjes.');
      }
      return api.entities.Redemption.redeem({
        prizeId: prize.id,
        userEmail: user.email,
        selectedSize: hasSizes ? selectedSize : null,
      });
    },
    onSuccess: () => {
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

  return (
    <Card className="overflow-hidden h-full flex flex-col group border-0 shadow-md hover:shadow-xl transition-shadow duration-300">
      {/* Header con carrusel de imágenes o fallback degradado+emoji */}
      <div
        ref={setViewportRef}
        aria-label="Carrusel de imágenes del premio"
        aria-roledescription="Carrusel"
        role="application"
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
        <PrizeImageCarousel
          hasRealImage={hasRealImage}
          imageList={imageList}
          totalImgs={totalImgs}
          safeIdx={safeIdx}
          viewportWidth={viewportWidth}
          dragOffset={dragOffset}
          isDragging={isDragging}
          gradient={gradient}
          prizeName={prize.name}
          onPointerDown={onPointerDown}
          onPointerMove={onPointerMove}
          onPointerUp={onPointerUp}
          onPrev={prevImg}
          onNext={nextImg}
          onSelectDot={(i) => setActiveImg(i)}
          onOpenLightbox={() => imageList[safeIdx] && setLightboxOpen(true)}
        />

        <Badge
          variant="secondary"
          className="absolute top-3 right-3 text-xs font-bold bg-gradient-to-r from-amber-400 to-amber-600 text-white border-0 shadow-lg"
        >
          <Sparkles className="w-3 h-3 mr-1" />
          {prize.points_cost} pts
        </Badge>
      </div>

      <CardContent className="p-4 flex flex-col flex-1">
        <div className="flex items-start justify-between mb-2">
          <h3 className="font-semibold text-base">{prize.name}</h3>
        </div>

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
                    onClick={() => setSelectedSize(isSelected ? null : size)}
                    className={`text-xs px-2.5 py-1 rounded-md border transition-colors flex items-center gap-1 ${
                      isSelected
                        ? 'bg-foreground text-background border-foreground'
                        : inStock
                        ? 'bg-background border-border hover:border-foreground'
                        : 'opacity-40 cursor-not-allowed border-border line-through'
                    }`}
                    title={inStock ? (isSelected ? `Click para deseleccionar ${size}` : `Talla ${size} disponible`) : `Talla ${size} agotada`}
                  >
                    <span className="font-medium">{size}</span>
                    {isSelected && (
                      <span className="text-[10px] opacity-80">· Seleccionada</span>
                    )}
                  </button>
                );
              })}
            </div>
          </div>
        )}

        <div className="flex items-center gap-2 mb-3">
          <Package className="w-3.5 h-3.5 text-muted-foreground" />
          <div className="text-xs text-muted-foreground">
            {(prize.units_available || 0) > 0 ? 'Disponible para canje' : 'Agotado'}
          </div>
        </div>

        <RedeemButton
          user={user}
          hasSizes={hasSizes}
          selectedSize={selectedSize}
          userPoints={availablePoints}
          pointsCost={prize.points_cost}
          unitsAvailable={prize.units_available}
          isPending={redeemMutation.isPending}
          onRedeem={() => {
            if (!user) { navigate('/login'); return; }
            const canAfford = availablePoints >= (prize.points_cost || 0);
            const inStock = (prize.units_available || 0) > 0;
            const needsSize = hasSizes && !selectedSize;
            if (needsSize) { toast.error('Selecciona una talla'); return; }
            if (!canAfford) { toast.error(`Te faltan ${prize.points_cost - availablePoints} pts`); return; }
            if (!inStock) { return; }
            setVerifyOpen(true);
          }}
        />
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

      <PrizeLightbox
        open={lightboxOpen}
        onClose={() => setLightboxOpen(false)}
        imageList={imageList}
        safeIdx={safeIdx}
        totalImgs={totalImgs}
        prizeName={prize.name}
        onPrev={prevImg}
        onNext={nextImg}
        onSelectDot={(i) => setActiveImg(i)}
      />
    </Card>
  );
}