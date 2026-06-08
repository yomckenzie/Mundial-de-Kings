import React, { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { api } from '@/api/client';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { CheckCircle2, Package, Instagram, Music2, User, Phone, Fingerprint, Copy, ExternalLink, CalendarDays } from 'lucide-react';
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

function UserProfileCard({ user, open, onClose }) {
  if (!user) return null;

  const initials = (user.full_name || user.email || '?')
    .split(' ')
    .map(w => w[0])
    .join('')
    .toUpperCase()
    .slice(0, 2);

  const joinedDate = user.created_date
    ? format(new Date(user.created_date), "d MMM yyyy", { locale: es })
    : '—';

  return (
    <Dialog open={open} onOpenChange={(o) => { if (!o) onClose(); }}>
      <DialogContent className="max-w-sm sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="sr-only">Perfil del usuario</DialogTitle>
        </DialogHeader>
        <div className="space-y-5">
          {/* Avatar + nombre */}
          <div className="flex flex-col items-center gap-2 pt-2">
            <div className="w-20 h-20 rounded-full bg-gradient-to-br from-primary to-primary/60 flex items-center justify-center shadow-lg">
              <span className="text-2xl font-bold text-primary-foreground">{initials}</span>
            </div>
            <div className="text-center">
              <h2 className="text-lg font-bold">{user.full_name || 'Sin nombre'}</h2>
              <p className="text-sm text-muted-foreground">{user.email}</p>
            </div>
          </div>

          {/* Redes sociales */}
          <div className="grid grid-cols-2 gap-3">
            <a
              href={user.instagram ? `https://instagram.com/${user.instagram}` : '#'}
              target={user.instagram ? '_blank' : undefined}
              rel={user.instagram ? 'noopener noreferrer' : undefined}
              className={`flex items-center gap-2.5 p-3 rounded-xl border transition ${
                user.instagram
                  ? 'bg-gradient-to-r from-pink-50 to-purple-50 dark:from-pink-950/20 dark:to-purple-950/20 border-pink-200 dark:border-pink-800/40 hover:shadow-md'
                  : 'bg-muted/30 border-border/50 opacity-50 cursor-not-allowed'
              }`}
            >
              <div className={`w-9 h-9 rounded-lg flex items-center justify-center ${user.instagram ? 'bg-gradient-to-br from-pink-500 to-purple-600' : 'bg-muted'}`}>
                <Instagram className="w-4 h-4 text-white" />
              </div>
              <div className="min-w-0 flex-1">
                <p className="text-xs text-muted-foreground">Instagram</p>
                <p className="text-sm font-semibold truncate">
                  {user.instagram ? `@${user.instagram}` : 'No registrado'}
                </p>
              </div>
              {user.instagram && <ExternalLink className="w-3.5 h-3.5 text-muted-foreground shrink-0" />}
            </a>

            <a
              href={user.tiktok ? `https://tiktok.com/@${user.tiktok}` : '#'}
              target={user.tiktok ? '_blank' : undefined}
              rel={user.tiktok ? 'noopener noreferrer' : undefined}
              className={`flex items-center gap-2.5 p-3 rounded-xl border transition ${
                user.tiktok
                  ? 'bg-gradient-to-r from-gray-50 to-gray-100 dark:from-gray-900 dark:to-gray-800 border-gray-200 dark:border-gray-700 hover:shadow-md'
                  : 'bg-muted/30 border-border/50 opacity-50 cursor-not-allowed'
              }`}
            >
              <div className={`w-9 h-9 rounded-lg flex items-center justify-center ${user.tiktok ? 'bg-black dark:bg-white' : 'bg-muted'}`}>
                <Music2 className={`w-4 h-4 ${user.tiktok ? 'text-white dark:text-black' : 'text-muted-foreground'}`} />
              </div>
              <div className="min-w-0 flex-1">
                <p className="text-xs text-muted-foreground">TikTok</p>
                <p className="text-sm font-semibold truncate">
                  {user.tiktok ? `@${user.tiktok}` : 'No registrado'}
                </p>
              </div>
              {user.tiktok && <ExternalLink className="w-3.5 h-3.5 text-muted-foreground shrink-0" />}
            </a>
          </div>

          {/* Datos personales */}
          <div className="space-y-2 bg-muted/50 rounded-xl p-4">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2 text-sm">
                <Phone className="w-4 h-4 text-muted-foreground" />
                <span className="text-muted-foreground">WhatsApp</span>
              </div>
              <span className="text-sm font-medium">{user.phone || user.whatsapp || '—'}</span>
            </div>
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2 text-sm">
                <Fingerprint className="w-4 h-4 text-muted-foreground" />
                <span className="text-muted-foreground">Cédula</span>
              </div>
              <span className="text-sm font-mono font-medium">{user.cedula || '—'}</span>
            </div>
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2 text-sm">
                <CalendarDays className="w-4 h-4 text-muted-foreground" />
                <span className="text-muted-foreground">Registrado</span>
              </div>
              <span className="text-sm font-medium">{joinedDate}</span>
            </div>
          </div>

          {/* Puntos */}
          <div className="grid grid-cols-3 gap-2">
            <div className="bg-gradient-to-b from-yellow-500/10 to-yellow-500/5 rounded-xl p-3 text-center border border-yellow-500/20">
              <p className="text-xl font-black">{user.prediction_points || 0}</p>
              <p className="text-[10px] text-muted-foreground leading-tight">Pronósticos</p>
            </div>
            <div className="bg-gradient-to-b from-emerald-500/10 to-emerald-500/5 rounded-xl p-3 text-center border border-emerald-500/20">
              <p className="text-xl font-black">{user.bonus_points || 0}</p>
              <p className="text-[10px] text-muted-foreground leading-tight">Bonos</p>
            </div>
            <div className="bg-gradient-to-b from-purple-500/10 to-purple-500/5 rounded-xl p-3 text-center border border-purple-500/20">
              <p className="text-xl font-black">{user.referral_points || 0}</p>
              <p className="text-[10px] text-muted-foreground leading-tight">Referidos</p>
            </div>
          </div>

          {/* Total + código referido */}
          <div className="flex items-center justify-between bg-primary/5 rounded-xl p-3 border border-primary/20">
            <div>
              <p className="text-xs text-muted-foreground">Total puntos</p>
              <p className="text-2xl font-black">{user.total_points || 0}</p>
            </div>
            {user.referral_code && (
              <Button
                size="sm"
                variant="outline"
                className="gap-1.5 text-xs"
                onClick={() => {
                  navigator.clipboard.writeText(user.referral_code);
                  toast.success('Código copiado: ' + user.referral_code);
                }}
              >
                <Copy className="w-3 h-3" />
                {user.referral_code}
              </Button>
            )}
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}

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
                  <div className="flex gap-1">
                    <Button
                      size="sm"
                      variant="outline"
                      className="gap-1"
                      onClick={() => setSelectedUser(user)}
                    >
                      <User className="w-3.5 h-3.5" />
                      Perfil
                    </Button>
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
          );
        })}
      </div>

      {/* Modal perfil visual */}
      {selectedUser && (
        <UserProfileCard
          user={selectedUser}
          open={!!selectedUser}
          onClose={() => setSelectedUser(null)}
        />
      )}
    </div>
  );
}