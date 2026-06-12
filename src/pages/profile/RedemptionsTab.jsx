import { m } from 'framer-motion';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Gift } from 'lucide-react';
import { Skeleton } from '@/components/ui/skeleton';

export default function RedemptionsTab({ redemptions, isLoading }) {
  if (isLoading) {
    return (
      <div className="space-y-3">
        {[1, 2, 3].map(i => <Skeleton key={i} className="h-16 w-full rounded-lg" />)}
      </div>
    );
  }

  if (redemptions.length === 0) {
    return (
      <Card>
        <CardContent className="p-8 text-center text-muted-foreground">
          <Gift className="w-10 h-10 mx-auto mb-3 opacity-30" />
          <p>No has canjeado premios aún.</p>
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="space-y-2">
      {redemptions.map((r, i) => (
        <m.div
          key={r.id}
          initial={{ opacity: 0, y: 8 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: i * 0.05, duration: 0.2 }}
        >
          <Card className="card-hover">
            <CardContent className="p-3 md:p-4 flex items-center justify-between gap-3">
              <div className="flex items-center gap-3">
                <div className="w-9 h-9 rounded-lg bg-muted flex items-center justify-center">
                  <Gift className="w-4 h-4 text-muted-foreground" />
                </div>
                <div>
                  <p className="font-medium text-sm">{r.prize_name}</p>
                  <p className="text-xs text-muted-foreground">
                    {r.points_spent} pts · {new Date(r.created_date).toLocaleDateString('es-PA')}
                  </p>
                </div>
              </div>
              <Badge variant={r.status === 'delivered' ? 'default' : r.status === 'approved' ? 'secondary' : r.status === 'rejected' ? 'destructive' : 'outline'} className="shrink-0">
                {r.status === 'pending' ? 'Pendiente' : r.status === 'approved' ? 'Aprobado' : r.status === 'delivered' ? 'Entregado' : 'Rechazado'}
              </Badge>
            </CardContent>
          </Card>
        </m.div>
      ))}
    </div>
  );
}
