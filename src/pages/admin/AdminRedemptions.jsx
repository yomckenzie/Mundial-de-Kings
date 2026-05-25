import React from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { api } from '@/api/client';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { CheckCircle2, Package } from 'lucide-react';
import { toast } from 'sonner';
import { format } from 'date-fns';
import { es } from 'date-fns/locale';

export default function AdminRedemptions() {
  const queryClient = useQueryClient();

  const { data: redemptions = [], isLoading } = useQuery({
    queryKey: ['admin-redemptions'],
    queryFn: () => api.entities.Redemption.list('-created_date'),
  });

  const updateStatus = useMutation({
    mutationFn: ({ id, status }) => api.entities.Redemption.update(id, { status }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['admin-redemptions'] });
      toast.success('Estado actualizado');
    },
  });

  const statusLabels = {
    pending: 'Pendiente',
    approved: 'Aprobado',
    delivered: 'Entregado',
  };

  const statusColors = {
    pending: 'bg-secondary text-secondary-foreground',
    approved: 'bg-primary text-primary-foreground',
    delivered: 'bg-accent text-accent-foreground',
  };

  if (isLoading) return <p className="text-muted-foreground">Cargando...</p>;

  return (
    <div className="space-y-4">
      <p className="text-sm text-muted-foreground">{redemptions.length} solicitudes de canje</p>

      {redemptions.length === 0 && (
        <p className="text-center text-muted-foreground py-8">No hay canjes todavía.</p>
      )}

      <div className="space-y-2">
        {redemptions.map(r => (
          <Card key={r.id}>
            <CardContent className="p-3">
              <div className="flex items-center justify-between mb-2">
                <div>
                  <p className="font-medium text-sm">{r.user_email}</p>
                  <p className="text-xs text-muted-foreground">
                    {r.created_date && format(new Date(r.created_date), "d MMM yyyy, HH:mm", { locale: es })}
                  </p>
                </div>
                <Badge className={statusColors[r.status]}>{statusLabels[r.status]}</Badge>
              </div>
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <Package className="w-4 h-4 text-muted-foreground" />
                  <span className="text-sm">{r.prize_name} · {r.points_spent} pts</span>
                </div>
                <div className="flex gap-1">
                  {r.status === 'pending' && (
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={() => updateStatus.mutate({ id: r.id, status: 'approved' })}
                    >
                      <CheckCircle2 className="w-4 h-4 mr-1" /> Aprobar
                    </Button>
                  )}
                  {r.status === 'approved' && (
                    <Button
                      size="sm"
                      onClick={() => updateStatus.mutate({ id: r.id, status: 'delivered' })}
                    >
                      <Package className="w-4 h-4 mr-1" /> Marcar Entregado
                    </Button>
                  )}
                </div>
              </div>
            </CardContent>
          </Card>
        ))}
      </div>
    </div>
  );
}