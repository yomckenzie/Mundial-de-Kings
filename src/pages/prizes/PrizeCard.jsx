import { useState } from 'react';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Package, Ruler, Sparkles } from 'lucide-react';

export default function PrizeCard({ prize }) {
  const hasSizes = prize.sizes && typeof prize.sizes === 'object' && Object.keys(prize.sizes).length > 0;
  const [imgError, setImgError] = useState(false);
  const gradient = prize.gradient || 'from-slate-600 to-slate-800';
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

        {/* Tallas disponibles */}
        {hasSizes && (
          <div className="mb-3">
            <div className="flex items-center gap-1 text-xs text-muted-foreground mb-1.5">
              <Ruler className="w-3 h-3" />
              <span>Tallas disponibles:</span>
            </div>
            <div className="flex flex-wrap gap-1.5">
              {Object.entries(prize.sizes).map(([size, stock]) => {
                const inStock = Number(stock) > 0;
                return (
                  <Badge
                    key={size}
                    variant={inStock ? 'default' : 'outline'}
                    className={`text-xs px-2 py-0.5 ${inStock ? 'bg-foreground text-background' : 'text-muted-foreground opacity-50'}`}
                  >
                    {size}
                    <span className="ml-1 font-normal opacity-70">({stock})</span>
                  </Badge>
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

        {/* Botón de canje (desactivado temporalmente) */}
        <Button
          className="w-full gap-1.5"
          disabled
          title="Los canjes están temporalmente desactivados"
        >
          <Package className="w-4 h-4" />
          Canjeos desactivados
        </Button>
      </CardContent>
    </Card>
  );
}
