import { Loader2, Package, Ruler } from 'lucide-react';
import { Button } from '@/components/ui/button';

/**
 * Botón de canje con todos los estados visuales posibles (sin usuario, sin
 * puntos, agotado, falta talla, procesando, OK). Centraliza la lógica para
 * no tener que duplicarla si PrizeCard se parte en varios componentes.
 */
export function RedeemButton({
  user,
  hasSizes,
  selectedSize,
  userPoints,
  pointsCost,
  unitsAvailable,
  isPending,
  onRedeem,
}) {
  const canAfford = userPoints >= (pointsCost || 0);
  const inStock = (unitsAvailable || 0) > 0;
  const needsSize = hasSizes && !selectedSize;
  const isDisabled = !user || !canAfford || !inStock || needsSize || isPending;

  return (
    <Button
      className="w-full gap-1.5"
      disabled={isDisabled}
      onClick={onRedeem}
      title={!user ? 'Inicia sesión para canjear' : needsSize ? 'Selecciona una talla' : !canAfford ? 'No tienes suficientes puntos' : 'Canjear premio'}
    >
      {isPending ? (
        <><Loader2 className="w-4 h-4 animate-spin" /> Procesando...</>
      ) : !user ? (
        <><Package className="w-4 h-4" /> Inicia sesión para canjear</>
      ) : !canAfford ? (
        <><Package className="w-4 h-4" /> Te faltan {pointsCost - userPoints} pts</>
      ) : !inStock ? (
        <><Package className="w-4 h-4" /> Agotado</>
      ) : needsSize ? (
        <><Ruler className="w-4 h-4" /> Selecciona talla</>
      ) : (
        <><Package className="w-4 h-4" /> Canjear por {pointsCost} pts</>
      )}
    </Button>
  );
}