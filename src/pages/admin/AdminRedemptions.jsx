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

// Estados válidos de un canje: pending → approved → delivered, o rejected.
// El admin filtra por estado para auditar pendientes o ver entregas cerradas.
const FILTER_OPTIONS = [
  { key: 'all',       label: 'Total de pedidos' },
  { key: 'pending',   label: 'Pendientes' },
  { key: 'approved',  label: 'Aprobado' },
  { key: 'delivered', label: 'Entregado' },
  { key: 'rejected',  label: 'Rechazado' },
];

export default function AdminRedemptions() {
  const queryClient = useQueryClient();
  const [selectedUser, setSelectedUser] = useState(null);
  // Estado del modal de rechazo
  const [rejectModal, setRejectModal] = useState({ open: false, redemption: null });
  // Filtro activo de estado (default: 'all' = total). Recalcula en vivo
  // cuando el admin aprueba/entrega/rechaza un canje (la query se invalida).
  const [statusFilter, setStatusFilter] = useState('all');

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

  // Conteos por estado — se calculan una sola vez por cambio de `redemptions`.
  // Se muestran entre paréntesis en cada botón del filtro para que el admin
  // sepa de un vistazo cuántos canjes tiene por categoría antes de filtrar.
  const statusCounts = React.useMemo(() => {
    const counts = { all: redemptions.length, pending: 0, approved: 0, delivered: 0, rejected: 0 };
    for (const r of redemptions) {
      if (counts[r.status] != null) counts[r.status]++;
    }
    return counts;
  }, [redemptions]);

  // Aplicar filtro actual. 'all' muestra todo, cualquier otro valor es estado exacto.
  const filteredRedemptions = React.useMemo(() => {
    if (statusFilter === 'all') return redemptions;
    return redemptions.filter(r => r.status === statusFilter);
  }, [redemptions, statusFilter]);

  const userMap = React.useMemo(() => {
    const map = {};
    users.forEach(u => { map[u.email] = u; });
    return map;
  }, [users]);

  // Mapa de premios por id, para mostrar la foto del premio canjeado.
  // El canje solo guarda prize_id/prize_name; la imagen vive en la tabla prizes.
  const prizeMap = React.useMemo(() => {
    const map = {};
    prizes.forEach(p => { map[p.id] = p; });
    return map;
  }, [prizes]);

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
      });

      // Crear una notificación efímera para que el usuario sepa al volver a la app.
      // NO bloqueamos el reject si la notification falla — el rechazo ya quedó.
      const reasonLabel = {
        producto_danado: 'producto dañado',
        sin_stock: 'sin stock',
        datos_incorrectos: 'datos incorrectos',
        fraude: 'posible fraude',
      }[reason] || (reason.startsWith('otro') ? reason.replace(/^otro:\s*/, '') : reason);

      try {
        await api.entities.UserNotification.create({
          user_email: redemption.user_email,
          type: 'redemption_rejected',
          title: `Tu canje de "${redemption.prize_name}" fue rechazado`,
          body: `Motivo: ${reasonLabel}. Tus ${redemption.points_spent} pts fueron devueltos y la unidad volvió al stock. Vuelve a hacer el canje si querés.`,
          related_id: redemption.id,
        });
      } catch (e) {
        console.warn('[AdminRedemptions] No se pudo crear la notification:', e?.message);
      }
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
      <p className="text-sm text-muted-foreground">
        {filteredRedemptions.length === redemptions.length
          ? `${redemptions.length} solicitudes de canje`
          : `${filteredRedemptions.length} de ${redemptions.length} solicitudes de canje`}
      </p>

      {/* Filtros por estado — Total / Pendientes / Aprobado / Entregado / Rechazado.
          Cada botón muestra el conteo entre paréntesis para que el admin vea de
          un vistazo cuántos canjes hay por categoría antes de filtrar. La lista
          debajo se ajusta en vivo (useMemo) cuando el admin aprueba/entrega/
          rechaza un canje (la query se invalida y `redemptions` cambia). */}
      <div className="flex flex-wrap gap-2 items-center">
        {FILTER_OPTIONS.map(f => (
          <Button
            key={f.key}
            size="sm"
            variant={statusFilter === f.key ? 'default' : 'outline'}
            onClick={() => setStatusFilter(f.key)}
          >
            {f.label}
            {` (${statusCounts[f.key] ?? 0})`}
          </Button>
        ))}
      </div>

      {redemptions.length === 0 && (
        <p className="text-center text-muted-foreground py-8">No hay canjes todavía.</p>
      )}

      {redemptions.length > 0 && filteredRedemptions.length === 0 && (
        <Card>
          <CardContent className="p-8 text-center text-muted-foreground">
            <p>No hay canjes en esta categoría.</p>
          </CardContent>
        </Card>
      )}

      <div className="space-y-2">
        {filteredRedemptions.map(r => (
          <RedemptionCard
            key={r.id}
            redemption={r}
            user={userMap[r.user_email]}
            prize={prizeMap[r.prize_id]}
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
