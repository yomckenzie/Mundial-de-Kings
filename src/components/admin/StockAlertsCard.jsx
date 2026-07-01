import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { AlertTriangle, Package } from 'lucide-react';
import { getStockSummary, getCriticalPrizes, getStockStatus } from '@/lib/prizeStock';

/**
 * Widget de stock crítico para el dashboard de admin.
 * Muestra:
 *   - 3 contadores grandes: agotados, por acabarse, ok
 *   - Lista top 5 de premios más críticos (agotados primero, luego menor %)
 */
export default function StockAlertsCard({ prizes = [] }) {
  const summary = getStockSummary(prizes);
  const critical = getCriticalPrizes(prizes, 5);

  return (
    <Card>
      <CardHeader className="pb-2">
        <CardTitle className="text-base flex items-center gap-2">
          <Package className="w-4 h-4" />
          Stock de premios
          {summary.out > 0 && (
            <Badge variant="destructive" className="ml-auto text-[10px]">
              {summary.out} agotado{summary.out === 1 ? '' : 's'}
            </Badge>
          )}
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        {/* Contadores grandes */}
        <div className="grid grid-cols-3 gap-2">
          <div className="rounded-md bg-destructive/10 border border-destructive/20 p-3 text-center">
            <p className="text-2xl font-black text-destructive">{summary.out}</p>
            <p className="text-[10px] uppercase tracking-wide text-destructive/80">Agotados</p>
          </div>
          <div className="rounded-md bg-yellow-500/10 border border-yellow-500/20 p-3 text-center">
            <p className="text-2xl font-black text-yellow-700 dark:text-yellow-400">{summary.low}</p>
            <p className="text-[10px] uppercase tracking-wide text-yellow-700/80 dark:text-yellow-400/80">Por acabarse</p>
          </div>
          <div className="rounded-md bg-green-500/10 border border-green-500/20 p-3 text-center">
            <p className="text-2xl font-black text-green-700 dark:text-green-400">{summary.ok}</p>
            <p className="text-[10px] uppercase tracking-wide text-green-700/80 dark:text-green-400/80">Con stock</p>
          </div>
        </div>

        {/* Lista de críticos */}
        {critical.length === 0 ? (
          <p className="text-sm text-muted-foreground text-center py-3">
            ✓ Todos los premios tienen stock saludable.
          </p>
        ) : (
          <div className="divide-y divide-border/50 -mx-6">
            {critical.map(({ prize, stock }) => (
              <div key={prize.id} className="px-6 py-2 flex items-center gap-3">
                <AlertTriangle
                  className={`w-4 h-4 shrink-0 ${
                    stock.status === 'out'
                      ? 'text-destructive'
                      : 'text-yellow-600 dark:text-yellow-400'
                  }`}
                />
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium truncate">{prize.name}</p>
                  <p className="text-[11px] text-muted-foreground">
                    {stock.status === 'out'
                      ? '0 unidades · agotado'
                      : `${stock.available} de ${stock.original} (${stock.percent}%)`}
                  </p>
                </div>
                <Badge
                  variant={stock.status === 'out' ? 'destructive' : 'outline'}
                  className={
                    stock.status === 'low'
                      ? 'bg-yellow-500/15 text-yellow-700 dark:text-yellow-400 border-yellow-500/30'
                      : ''
                  }
                >
                  {stock.status === 'out' ? 'Agotado' : `${stock.percent}%`}
                </Badge>
              </div>
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  );
}