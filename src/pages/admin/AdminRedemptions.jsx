import React, { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { api } from '@/api/client';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Textarea } from '@/components/ui/textarea';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from '@/components/ui/dialog';
import { CheckCircle2, Package, Instagram, Music2, User, Phone, Fingerprint, Copy, ExternalLink, CalendarDays, Target, Sparkles, Gift, TrendingUp, Clock, Users, ChevronDown, ChevronUp, X, Ban } from 'lucide-react';
import { toast } from 'sonner';
import UserProfileCard from '@/components/admin/UserProfileCard';
import { format } from 'date-fns';
import { es } from 'date-fns/locale/es';

const statusLabels = {
  pending: 'Pendiente',
  approved: 'Aprobado',
  delivered: 'Entregado',
  rejected: 'Rechazado',
};

const statusColors = {
  pending: 'bg-secondary text-secondary-foreground',
  approved: 'bg-primary text-primary-foreground',
  delivered: 'bg-accent text-accent-foreground',
  rejected: 'bg-destructive text-destructive-foreground',
};

const REJECTION_REASONS = [
  { value: 'producto_danado', label: 'Producto dañado' },
  { value: 'sin_stock', label: 'Sin stock / agotado' },
  { value: 'datos_incorrectos', label: 'Datos del usuario incorrectos' },
  { value: 'fraude', label: 'Posible fraude' },
  { value: 'otro', label: 'Otro (especificar)' },
];



export default function AdminRedemptions() {
  const queryClient = useQueryClient();
  const [selectedUser, setSelectedUser] = useState(null);
  // Estado del modal de rechazo
  const [rejectModal, setRejectModal] = useState({ open: false, redemption: null, reason: '', customReason: '' });

  const { data: redemptions = [], isLoading } = useQuery({
    queryKey: ['admin-redemptions'],
    queryFn: () => api.entities.Redemption.list('-created_date'),
  });

  const { data: users = [] } = useQuery({
    queryKey: ['admin-users-redemptions'],
    queryFn: () => api.entities.User.list(),
  });

  const { data: prizes = [] } = useQuery({
    queryKey: ['admin-prizes-redemptions'],
    queryFn: () => api.entities.Prize.list(),
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

  // Rechazar canje: devuelve puntos al usuario, devuelve unidad al premio,
  // guarda la razón en el canje.
  const rejectRedemption = useMutation({
    mutationFn: async ({ redemption, reason }) => {
      const finalReason = reason === 'otro' ? `otro: ${rejectModal.customReason.trim()}` : reason;
      const user = userMap[redemption.user_email];
      const prize = prizes.find(p => p.id === redemption.prize_id);

      // 1. Devolver puntos al usuario (total_points y bonus_points)
      // NOTA: total_points es "histórico ganado"; los disponibles se calculan
      // como total - sum(points_spent). Por tanto, para reflejar la devolución
      // en el saldo disponible, restamos points_spent del total_points (porque
      // en el canje original se sumó a "gastado" sin restar de total).
      if (user) {
        await api.entities.User.update(user.id, {
          total_points: Math.max(0, (user.total_points || 0) - (redemption.points_spent || 0)),
        });
      }

      // 2. Devolver la unidad al stock del premio
      if (prize) {
        await api.entities.Prize.update(prize.id, {
          units_available: (prize.units_available || 0) + 1,
        });
      }

      // 3. Marcar canje como rechazado con razón + timestamp
      await api.entities.Redemption.update(redemption.id, {
        status: 'rejected',
        rejection_reason: finalReason,
        rejected_at: new Date().toISOString(),
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['admin-redemptions'] });
      queryClient.invalidateQueries({ queryKey: ['admin-users-redemptions'] });
      queryClient.invalidateQueries({ queryKey: ['admin-prizes-redemptions'] });
      queryClient.invalidateQueries({ queryKey: ['my-redemptions'] });
      queryClient.invalidateQueries({ queryKey: ['ranking'] });
      setRejectModal({ open: false, redemption: null, reason: '', customReason: '' });
      toast.success('Canje rechazado. Puntos y unidad devueltos al usuario.');
    },
    onError: (err) => {
      toast.error('Error al rechazar: ' + (err?.message || 'Error'));
    },
  });

  const openRejectModal = (redemption) => {
    setRejectModal({ open: true, redemption, reason: '', customReason: '' });
  };

  const handleConfirmReject = () => {
    if (!rejectModal.reason) {
      toast.error('Selecciona una razón de rechazo');
      return;
    }
    if (rejectModal.reason === 'otro' && !rejectModal.customReason.trim()) {
      toast.error('Especifica la razón');
      return;
    }
    rejectRedemption.mutate({
      redemption: rejectModal.redemption,
      reason: rejectModal.reason,
    });
  };

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
          const canReject = r.status === 'pending' || r.status === 'approved';
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
                    {canReject && (
                      <Button
                        size="sm"
                        variant="destructive"
                        className="text-xs px-2 gap-1"
                        onClick={() => openRejectModal(r)}
                      >
                        <X className="w-4 h-4" /> <span className="hidden sm:inline">Rechazar</span>
                      </Button>
                    )}
                  </div>
                </div>
              </CardContent>
            </Card>
          );
        })}
      </div>

      {/* Modal de rechazo */}
      <Dialog
        open={rejectModal.open}
        onOpenChange={(o) => {
          if (!o) setRejectModal({ open: false, redemption: null, reason: '', customReason: '' });
        }}
      >
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Ban className="w-5 h-5 text-destructive" />
              Rechazar canje
            </DialogTitle>
            <DialogDescription className="sr-only">
              Selecciona la razón del rechazo. Los puntos se devolverán al usuario y la unidad volverá al stock del premio.
            </DialogDescription>
          </DialogHeader>

          {rejectModal.redemption && (
            <div className="space-y-4">
              <div className="bg-muted/30 rounded-lg p-3 text-sm space-y-1">
                <p><span className="text-muted-foreground">Usuario:</span> <strong>{rejectModal.redemption.user_email}</strong></p>
                <p><span className="text-muted-foreground">Premio:</span> <strong>{rejectModal.redemption.prize_name}</strong></p>
                <p><span className="text-muted-foreground">Puntos:</span> <strong>{rejectModal.redemption.points_spent} pts</strong></p>
              </div>

              <div className="bg-amber-50 dark:bg-amber-950/20 border border-amber-200 dark:border-amber-900/40 rounded-lg p-3 text-xs text-amber-900 dark:text-amber-200 space-y-1">
                <p className="font-semibold">⚠️ Al rechazar:</p>
                <ul className="list-disc pl-4 space-y-0.5">
                  <li>Se devolverán <strong>{rejectModal.redemption.points_spent} pts</strong> al usuario</li>
                  <li>La unidad volverá al stock del premio</li>
                </ul>
              </div>

              <div className="space-y-1.5">
                <label className="text-sm font-medium">Razón del rechazo</label>
                <div className="space-y-1.5">
                  {REJECTION_REASONS.map((r) => (
                    <label
                      key={r.value}
                      className={`flex items-center gap-2 p-2 rounded-md border cursor-pointer transition-colors ${
                        rejectModal.reason === r.value
                          ? 'border-secondary bg-secondary/10'
                          : 'border-border hover:bg-muted/30'
                      }`}
                    >
                      <input
                        type="radio"
                        name="rejection-reason"
                        value={r.value}
                        checked={rejectModal.reason === r.value}
                        onChange={() => setRejectModal(m => ({ ...m, reason: r.value }))}
                        className="accent-secondary"
                      />
                      <span className="text-sm">{r.label}</span>
                    </label>
                  ))}
                </div>
              </div>

              {rejectModal.reason === 'otro' && (
                <div className="space-y-1.5">
                  <label className="text-sm font-medium">Especifica la razón</label>
                  <Textarea
                    rows={2}
                    value={rejectModal.customReason}
                    onChange={(e) => setRejectModal(m => ({ ...m, customReason: e.target.value }))}
                    placeholder="Describe brevemente la razón..."
                    maxLength={200}
                  />
                  <p className="text-[10px] text-muted-foreground text-right">
                    {rejectModal.customReason.length}/200
                  </p>
                </div>
              )}
            </div>
          )}

          <DialogFooter className="flex-col sm:flex-row gap-2">
            <Button
              variant="outline"
              onClick={() => setRejectModal({ open: false, redemption: null, reason: '', customReason: '' })}
              disabled={rejectRedemption.isPending}
              className="w-full sm:w-auto"
            >
              Cancelar
            </Button>
            <Button
              variant="destructive"
              onClick={handleConfirmReject}
              disabled={rejectRedemption.isPending || !rejectModal.reason}
              className="w-full sm:w-auto gap-1"
            >
              <Ban className="w-4 h-4" />
              {rejectRedemption.isPending ? 'Rechazando...' : 'Confirmar rechazo'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Modal perfil visual — siempre renderizado, open controla visibilidad */}
      <UserProfileCard
        user={selectedUser}
        open={!!selectedUser}
        onClose={() => setSelectedUser(null)}
      />
    </div>
  );
}