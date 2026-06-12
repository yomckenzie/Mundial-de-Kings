import React, { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { api } from '@/api/client';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { User, X, Ban } from 'lucide-react';
import { toast } from 'sonner';
import UserProfileCard from '@/components/admin/UserProfileCard';
import { format } from 'date-fns';
import { es } from 'date-fns/locale/es';
import RedemptionCard from './redemptions/RedemptionCard';
import RejectRedemptionDialog from './redemptions/RejectRedemptionDialog';

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

export default function AdminRedemptions() {
  const queryClient = useQueryClient();
  const [selectedUser, setSelectedUser] = useState(null);
  // Estado del modal de rechazo
  const [rejectModal, setRejectModal] = useState({ open: false, redemption: null });

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

  const rejectRedemption = useMutation({
    mutationFn: async ({ redemption, reason }) => {
      // Los puntos NUNCA se restaron (solo se "reservaron" en status pending).
      // El disponible se calcula dinámicamente: total - sum(points_spent de canjes activos).
      // Al rechazar (cambiar status a rejected), el canje ya no cuenta como activo,
      // así que el saldo disponible se incrementa automáticamente.
      // NO necesitamos sumar puntos ni actualizar stock: solo marcar como rechazado.

      await api.entities.Redemption.update(redemption.id, {
        status: 'rejected',
        rejection_reason: reason,
        rejected_at: new Date().toISOString(),
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['admin-redemptions'] });
      queryClient.invalidateQueries({ queryKey: ['admin-users-redemptions'] });
      queryClient.invalidateQueries({ queryKey: ['admin-prizes-redemptions'] });
      queryClient.invalidateQueries({ queryKey: ['my-redemptions'] });
      queryClient.invalidateQueries({ queryKey: ['ranking'] });
      setRejectModal({ open: false, redemption: null });
      toast.success('Canje rechazado. Puntos y unidad devueltos al usuario.');
    },
    onError: (err) => {
      toast.error('Error al rechazar: ' + (err?.message || 'Error'));
    },
  });

  const handleOpenReject = (redemption) => {
    setRejectModal({ open: true, redemption });
  };

  const handleConfirmReject = ({ reason, customReason }) => {
    const finalReason = reason === 'otro' ? `otro: ${customReason.trim()}` : reason;
    rejectRedemption.mutate({
      redemption: rejectModal.redemption,
      reason: finalReason,
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
        {redemptions.map(r => (
          <RedemptionCard
            key={r.id}
            redemption={r}
            user={userMap[r.user_email]}
            onOpenProfile={setSelectedUser}
            onApprove={() => updateStatus.mutate({ id: r.id, status: 'approved' })}
            onDeliver={() => updateStatus.mutate({ id: r.id, status: 'delivered' })}
            onReject={() => handleOpenReject(r)}
            statusLabels={statusLabels}
            statusColors={statusColors}
          />
        ))}
      </div>

      <RejectRedemptionDialog
        open={rejectModal.open}
        redemption={rejectModal.redemption}
        onClose={() => setRejectModal({ open: false, redemption: null })}
        onConfirm={handleConfirmReject}
        isPending={rejectRedemption.isPending}
      />

      {/* Modal perfil visual — siempre renderizado, open controla visibilidad */}
      <UserProfileCard
        user={selectedUser}
        open={!!selectedUser}
        onClose={() => setSelectedUser(null)}
      />
    </div>
  );
}
