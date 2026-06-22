import React from 'react';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { CheckCircle2, Package, User, X, Ban } from 'lucide-react';
import { format } from 'date-fns';
import { es } from 'date-fns/locale/es';

/**
 * Tarjeta de una solicitud de canje individual. Recibe los handlers y el
 * mapa de etiquetas/colores por status desde el padre para mantenerlo puro
 * y fácil de testear.
 */
export default function RedemptionCard({
  redemption: r,
  user,
  prize,
  onOpenProfile,
  onApprove,
  onDeliver,
  onReject,
  statusLabels,
  statusColors,
}) {
  const canReject = r.status === 'pending' || r.status === 'approved';

  const openProfile = () => onOpenProfile(user);

  // Imagen del premio: soportar image_urls (array, nuevo) y image_url (legacy)
  const prizeImage = (Array.isArray(prize?.image_urls) && prize.image_urls.length > 0)
    ? prize.image_urls[0]
    : (prize?.image_url || null);

  // ¿El premio tiene tallas? (para saber si debíamos haber capturado una)
  const prizeHasSizes = prize && (
    (prize.original_sizes && Object.keys(prize.original_sizes).length > 0) ||
    (prize.sizes && Object.keys(prize.sizes).length > 0)
  );

  return (
    <Card>
      <CardContent className="p-3">
        <div className="flex items-start justify-between mb-2">
          <button
            type="button"
            onClick={openProfile}
            className="text-left space-y-1 min-w-0 flex-1 group"
          >
            <div className="flex items-center gap-2">
              <div className="w-7 h-7 rounded-full bg-gradient-to-br from-primary to-primary/60 flex items-center justify-center shrink-0">
                <User className="w-3.5 h-3.5 text-primary-foreground" />
              </div>
              <p className="font-semibold text-sm group-hover:text-primary transition-colors">{r.user_email}</p>
            </div>
            <div className="flex items-center gap-1.5 text-xs text-muted-foreground pl-9">
              <span>
                {r.created_date && format(new Date(r.created_date), "d MMM yyyy, HH:mm", { locale: es })}
              </span>
              {user?.instagram && (
                <>
                  <span>·</span>
                  <span>📷 @{user.instagram}</span>
                </>
              )}
              {user?.tiktok && (
                <>
                  <span>·</span>
                  <span>🎵 @{user.tiktok}</span>
                </>
              )}
            </div>
            {r.status === 'rejected' && r.rejection_reason && (
              <div className="pl-9 mt-1">
                <Badge variant="outline" className="text-[10px] border-destructive/30 text-destructive">
                  <Ban className="w-3 h-3 mr-1" /> {r.rejection_reason}
                </Badge>
              </div>
            )}
          </button>
          <Badge className={statusColors[r.status]}>{statusLabels[r.status]}</Badge>
        </div>
        {/* Producto canjeado: foto + nombre + talla */}
        <div className="flex items-center gap-3 mb-2 p-2 rounded-lg bg-muted/40">
          {prizeImage ? (
            <a
              href={prizeImage}
              target="_blank"
              rel="noopener noreferrer"
              className="shrink-0 w-16 h-16 rounded-md overflow-hidden border border-border bg-white"
              title="Abrir imagen del premio"
            >
              <img
                src={prizeImage}
                alt={r.prize_name}
                loading="lazy"
                className="w-full h-full object-cover"
              />
            </a>
          ) : (
            <div className="shrink-0 w-16 h-16 rounded-md bg-muted flex items-center justify-center">
              <Package className="w-6 h-6 text-muted-foreground" />
            </div>
          )}
          <div className="min-w-0 flex-1">
            <p className="font-semibold text-sm truncate">{r.prize_name}</p>
            <p className="text-xs text-muted-foreground">{r.points_spent} pts</p>
            <div className="mt-1">
              {r.selected_size ? (
                <Badge className="bg-foreground text-background text-[11px] px-2 py-0.5">
                  Talla: {r.selected_size}
                </Badge>
              ) : prizeHasSizes ? (
                <Badge variant="outline" className="text-[10px] px-1.5 py-0 border-amber-400 text-amber-600">
                  Talla no registrada — confirmar con usuario
                </Badge>
              ) : (
                <Badge variant="outline" className="text-[10px] px-1.5 py-0 text-muted-foreground">
                  Talla única
                </Badge>
              )}
            </div>
          </div>
        </div>

        <div className="flex items-center justify-end">
          <div className="flex gap-1 flex-wrap justify-end">
            <Button
              size="sm"
              variant="outline"
              className="gap-1 text-xs px-2"
              onClick={openProfile}
            >
              <User className="w-3.5 h-3.5" />
              <span className="hidden sm:inline">Perfil</span>
            </Button>
            {r.status === 'pending' && (
              <Button
                size="sm"
                variant="outline"
                className="text-xs px-2 gap-1"
                onClick={onApprove}
              >
                <CheckCircle2 className="w-4 h-4" /> <span className="hidden sm:inline">Aprobar</span>
              </Button>
            )}
            {r.status === 'approved' && (
              <Button
                size="sm"
                className="text-xs px-2 gap-1"
                onClick={onDeliver}
              >
                <Package className="w-4 h-4" /> <span className="hidden sm:inline">Entregar</span>
              </Button>
            )}
            {canReject && (
              <Button
                size="sm"
                variant="destructive"
                className="text-xs px-2 gap-1"
                onClick={onReject}
              >
                <X className="w-4 h-4" /> <span className="hidden sm:inline">Rechazar</span>
              </Button>
            )}
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
