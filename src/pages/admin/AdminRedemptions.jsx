import React, { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { api } from '@/api/client';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { CheckCircle2, Package, Instagram, Music2, User, Phone, Fingerprint, Copy, ExternalLink, CalendarDays, Target, Sparkles, Gift, TrendingUp, Clock, Users, ChevronDown, ChevronUp } from 'lucide-react';
import { toast } from 'sonner';
import UserProfileCard from '@/components/admin/UserProfileCard';
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



export default function AdminRedemptions() {
  const queryClient = useQueryClient();
  const [selectedUser, setSelectedUser] = useState(null);

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
        {redemptions.map(r => {
          const user = userMap[r.user_email];
          return (
            <Card key={r.id}>
              <CardContent className="p-3">
                <div className="flex items-start justify-between mb-2">
                  <button
                    type="button"
                    onClick={() => setSelectedUser(user)}
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
                  </button>
                  <Badge className={statusColors[r.status]}>{statusLabels[r.status]}</Badge>
                </div>
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <Package className="w-4 h-4 text-muted-foreground" />
                    <span className="text-sm">{r.prize_name} · {r.points_spent} pts</span>
                  </div>
                  <div className="flex gap-1 flex-wrap justify-end">
                    <Button
                      size="sm"
                      variant="outline"
                      className="gap-1 text-xs px-2"
                      onClick={() => setSelectedUser(user)}
                    >
                      <User className="w-3.5 h-3.5" />
                      <span className="hidden sm:inline">Perfil</span>
                    </Button>
                    {r.status === 'pending' && (
                      <Button
                        size="sm"
                        variant="outline"
                        className="text-xs px-2 gap-1"
                        onClick={() => updateStatus.mutate({ id: r.id, status: 'approved' })}
                      >
                        <CheckCircle2 className="w-4 h-4" /> <span className="hidden sm:inline">Aprobar</span>
                      </Button>
                    )}
                    {r.status === 'approved' && (
                      <Button
                        size="sm"
                        className="text-xs px-2 gap-1"
                        onClick={() => updateStatus.mutate({ id: r.id, status: 'delivered' })}
                      >
                        <Package className="w-4 h-4" /> <span className="hidden sm:inline">Entregar</span>
                      </Button>
                    )}
                  </div>
                </div>
              </CardContent>
            </Card>
          );
        })}
      </div>

      {/* Modal perfil visual — siempre renderizado, open controla visibilidad */}
      <UserProfileCard
        user={selectedUser}
        open={!!selectedUser}
        onClose={() => setSelectedUser(null)}
      />
    </div>
  );
}