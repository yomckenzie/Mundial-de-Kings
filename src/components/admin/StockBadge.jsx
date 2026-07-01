import { Badge } from '@/components/ui/badge';

/**
 * Badge compacto que indica el estado de stock de un premio.
 * out = agotado (rojo/disabled)
 * low = por acabarse (≤20% o ≤3 unidades, amarillo)
 * ok  = stock saludable (verde, sutil)
 */
export default function StockBadge({ status, available, percent, className = '' }) {
  if (status === 'out') {
    return (
      <Badge variant="destructive" className={className} title="Agotado: 0 unidades disponibles">
        Agotado
      </Badge>
    );
  }
  if (status === 'low') {
    return (
      <Badge
        variant="outline"
        className={`bg-yellow-500/15 text-yellow-700 dark:text-yellow-400 border-yellow-500/30 ${className}`}
        title={`Por acabarse: ${available} unidades (${percent}% del stock original)`}
      >
        Por acabarse · {available}
      </Badge>
    );
  }
  return (
    <Badge
      variant="outline"
      className={`bg-green-500/10 text-green-700 dark:text-green-400 border-green-500/20 ${className}`}
      title={`${available} unidades disponibles (${percent}% del stock original)`}
    >
      {available} disp.
    </Badge>
  );
}