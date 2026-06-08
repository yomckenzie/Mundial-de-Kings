import React from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { api } from '@/api/client';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { CheckCircle2, Package } from 'lucide-react';
import { toast } from 'sonner';
import { format } from 'date-fns';
import { es } from 'date-fns/locale/es';

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

function UserProfileInfo({ user }) {
  if (!user) return null;
  return (
    <div className="flex flex-wrap gap-x-4 gap-y-0.5 pt-0.5">
      {user.full_name && (
        <span className="text-xs">
          👤 <span className="font-medium">{user.full_name}</span>
        </span>
      )}
      {user.instagram ? (
        <span className="text-xs">
          📷 <a href={`https://instagram.com/${user.instagram}`} target="_blank" rel="noopener noreferrer" className="font-medium hover:underline">@{user.instagram}</a>
        </span>
      ) : (
        <span className="text-xs text-destructive/70">📷 Sin Instagram</span>
      )}
      {user.tiktok ? (
        <span className="text-xs">
          🎵 <a href={`https://tiktok.com/@${user.tiktok}`} target="_blank" rel="noopener noreferrer" className="font-medium hover:underline">@{user.tiktok}</a>
        </span>
      ) : (
        <span className="text-xs text-destructive/70">🎵 Sin TikTok</span>
      )}
      {user.cedula && (
        <span className="text-xs">
          🆔 <span className="font-mono">{user.cedula}</span>
        </span>
      )}
    </div>
  );
}

export default function AdminRedemptions() {
  const queryClient = useQueryClient();

  const { data: redemptions = [], isLoading } = useQuery({
    queryKey: ['admin-redemptions'],
    queryFn: () => api.entities.Redemption.list('-created_date'),
  });

  const { data: users = [] } = useQuery({
    queryKey: ['admin-users-redemptions'],
    queryFn: () => api.entities.User.list(),
  });

  const userMap = React.useMemo(() => {
    const map = {};
    users.forEach(u => { map[u.email] = u; });
    return map;
  }, [users]);

  const updateStatus = useMutation({
    mutationFn: ({ id, status }) => api.entities.Redemption.update(id, { status }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['admin-redemptions'] });
      toast.success('Estado actualizado');
    },
  });

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
              <div className="flex items-start justify-between mb-2">
                <div className="space-y-1 min-w-0">
                  <p className="font-semibold text-sm">{r.user_email}</p>
                  <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
                    <span>
                      {r.created_date && format(new Date(r.created_date), "d MMM yyyy, HH:mm", { locale: es })}
                    </span>
                  </div>
                  {/* Perfil del usuario */}
                  <UserProfileInfo user={userMap[r.user_email]} />
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