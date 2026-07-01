import React from 'react';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Trash2, Gift, Pencil } from 'lucide-react';
import { getStockStatus } from '@/lib/prizeStock';
import StockBadge from '@/components/admin/StockBadge';

/**
 * Tarjeta que muestra un premio en la lista del admin.
 * Es presentacional: recibe el premio y handlers desde el padre.
 */
export default function PrizeCard({ prize: p, onDelete, onEdit }) {
  const totalUnits = computeTotalUnits(p);
  const hasSizes = p.sizes && typeof p.sizes === 'object' && Object.keys(p.sizes).length > 0;
  // FIX jul 2026: badge dinámico de stock (Agotado / Por acabarse / disp.).
  // Antes solo se mostraba la cifra "{totalUnits} unidades" sin distinguir si
  // era un premio realmente disponible, casi agotado, o ya sin stock.
  const stockStatus = getStockStatus(p);

  return (
    <Card className={stockStatus.status === 'out' ? 'opacity-60' : ''}>
      <CardContent className="p-3 flex items-center gap-3">
        {p.image_url ? (
          <button
            type="button"
            aria-label={`Abrir imagen de ${p.name}`}
            className="w-14 h-14 rounded overflow-hidden cursor-pointer p-0 border-0 shrink-0"
            onClick={() => window.open(p.image_url, '_blank')}
          >
            <img src={p.image_url} alt={p.name} loading="lazy" decoding="async" className="w-full h-full object-cover hover:scale-110 transition-transform duration-200" />
          </button>
        ) : (
          <div className="w-14 h-14 rounded bg-muted flex items-center justify-center shrink-0">
            <Gift className="w-6 h-6 text-muted-foreground" />
          </div>
        )}
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <p className="font-medium truncate">{p.name}</p>
            <Badge variant={p.status === 'active' ? 'default' : 'secondary'}>
              {p.status === 'active' ? 'Activo' : 'Inactivo'}
            </Badge>
            <StockBadge
              status={stockStatus.status}
              available={stockStatus.available}
              percent={stockStatus.percent}
              className="text-[10px] px-1.5 py-0"
            />
          </div>
          <p className="text-sm text-muted-foreground">
            {p.points_cost} pts · {totalUnits} unidades{stockStatus.original > 0 ? ` / ${stockStatus.original} orig.` : ''}
          </p>
          {hasSizes && (
            <div className="flex flex-wrap gap-1 mt-1">
              {Object.entries(p.sizes).map(([size, stock]) => {
                const isOut = Number(stock) <= 0;
                return (
                  <Badge
                    key={size}
                    variant="outline"
                    className={`text-[10px] px-1.5 py-0 ${isOut ? 'opacity-50 line-through' : ''}`}
                    title={isOut ? `${size}: agotado` : `${size}: ${stock} disponibles`}
                  >
                    {size}: {stock}
                  </Badge>
                );
              })}
            </div>
          )}
        </div>
        <div className="flex gap-1 shrink-0">
          {onEdit && (
            <Button
              size="sm"
              variant="ghost"
              title="Editar premio (nombre, puntos, tallas, stock)"
              onClick={() => onEdit(p)}
            >
              <Pencil className="w-4 h-4" />
            </Button>
          )}
          {onDelete && (
            <Button
              size="sm"
              variant="ghost"
              className="text-destructive hover:text-destructive"
              onClick={() => {
                if (window.confirm(`¿Eliminar "${p.name}" definitivamente?`)) {
                  onDelete(p.id);
                }
              }}
            >
              <Trash2 className="w-4 h-4" />
            </Button>
          )}
        </div>
      </CardContent>
    </Card>
  );
}

// Total de unidades: si tiene tallas, suma; si no, usa units_available
function computeTotalUnits(prize) {
  if (prize.sizes && typeof prize.sizes === 'object') {
    return Object.values(prize.sizes).reduce((sum, s) => sum + (Number(s) || 0), 0);
  }
  return prize.units_available || 0;
}
