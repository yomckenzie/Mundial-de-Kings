import { useState } from 'react';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Package, Ruler, Sparkles, Loader2 } from 'lucide-react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { api } from '@/api/client';
import { useOutletContext } from 'react-router-dom';
import { toast } from 'sonner';
import { useNavigate } from 'react-router-dom';

export default function PrizeCard({ prize }) {
  const { user } = useOutletContext();
  const queryClient = useQueryClient();
  const navigate = useNavigate();
  const hasSizes = prize.sizes && typeof prize.sizes === 'object' && Object.keys(prize.sizes).length > 0;
  const [imgError, setImgError] = useState(false);
  const [selectedSize, setSelectedSize] = useState(null);
  const gradient = prize.gradient || 'from-slate-600 to-slate-800';

  // Mutation de canje. Descuenta puntos del user y crea un redemption pending.
  // El admin aprueba/rechaza desde /admin/redemptions.
  const redeemMutation = useMutation({
    mutationFn: async () => {
      const pointsCost = Number(prize.points_cost) || 0;
      const payload = {
        user_email: user.email,
        prize_id: prize.id,
        prize_name: prize.name,
        points_spent: pointsCost,
        status: 'pending',
        selected_size: hasSizes ? selectedSize : null,
      };
      return api.entities.Redemption.create(payload);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['prizes'] });
      queryClient.invalidateQueries({ queryKey: ['admin-prizes'] });
      queryClient.invalidateQueries({ queryKey: ['my-redemptions', user?.email] });
      queryClient.invalidateQueries({ queryKey: ['admin-redemptions'] });
      queryClient.invalidateQueries({ queryKey: ['admin-prizes-redemptions'] });
      toast.success(`🎁 Solicitud enviada. Pendiente de aprobación.`);
      setSelectedSize(null);
    },
    onError: (err) => toast.error('Error al canjear: ' + (err.message || 'Error')),
  });
  const emoji = prize.icon || '🎁';
  const hasRealImage = prize.image_url && !imgError;

  return (
    <Card className="overflow-hidden h-full flex flex-col group border-0 shadow-md hover:shadow-xl transition-shadow duration-300">
      {/* Header con imagen real o fallback degradado+emoji */}
      <div
        className={`relative aspect-video w-full overflow-hidden ${
          !hasRealImage ? `bg-gradient-to-br ${gradient} flex items-center justify-center` : ''
        }`}
      >
        {hasRealImage ? (
          <>
            <img
              src={prize.image_url}
              alt={prize.name}
              className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-500 ease-out"
              onError={() => setImgError(true)}
              loading="lazy"
            />
            {/* Overlay sutil en la parte inferior */}
            <div className="absolute inset-0 bg-gradient-to-t from-black/30 to-transparent" />
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
          const userPoints = user?.total_points || 0;
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
                if (window.confirm(`¿Canjear "${prize.name}" por ${prize.points_cost} pts?`)) {
                  redeemMutation.mutate();
                }
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
    </Card>
  );
}
