import React, { useState, useMemo, useCallback } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { api } from '@/api/client';
import { toast } from 'sonner';
import GrantPointsModal from '@/components/admin/GrantPointsModal';
import UserCard from './UserCard';
import FiltersPanel from './FiltersPanel';
import CreateReferrerDialog from './CreateReferrerDialog';
import DeleteUserDialog from './DeleteUserDialog';
import UserSearchBar from './UserSearchBar';
import UserPagination from './UserPagination';

const PAGE_SIZE = 20;

export default function AdminUsers() {
  const [ui, setUi] = useState({
    search: '',
    page: 0,
    showFilters: false,
    grantUser: null,
    deleteUser: null,
    deletingUser: false,
    customReferrer: { open: false, name: '', code: '', points: '' },
    filters: {
      dateFrom: '',
      dateTo: '',
      minPoints: '',
      maxPoints: '',
      minAciertos: '',
      maxAciertos: '',
      minCanjes: '',
      maxCanjes: '',
    },
  });

  const queryClient = useQueryClient();

  const { data: users = [], isLoading: loadingUsers } = useQuery({
    queryKey: ['admin-users'],
    queryFn: () => api.entities.User.list('-created_date'),
  });

  const { data: predictions = [] } = useQuery({
    queryKey: ['admin-predictions-all'],
    queryFn: () => api.entities.Prediction.list(),
  });

  const { data: redemptions = [] } = useQuery({
    queryKey: ['admin-redemptions-all'],
    queryFn: () => api.entities.Redemption.list(),
  });

  const { data: referrals = [] } = useQuery({
    queryKey: ['admin-referrals-list'],
    queryFn: () => api.entities.Referral.list(),
  });

  // Conteo de referidos por email
  const referredCountMap = useMemo(() => {
    const map = {};
    referrals.forEach(r => { map[r.referrer_email] = (map[r.referrer_email] || 0) + 1; });
    return map;
  }, [referrals]);

  // Mapas de aciertos y canjes por email
  const aciertosMap = useMemo(() => {
    const map = {};
    predictions.forEach(p => {
      if (p.is_correct) map[p.user_email] = (map[p.user_email] || 0) + 1;
    });
    return map;
  }, [predictions]);

  const canjesMap = useMemo(() => {
    const map = {};
    redemptions.forEach(r => {
      map[r.user_email] = (map[r.user_email] || 0) + 1;
    });
    return map;
  }, [redemptions]);

  const setFilter = (key, value) => {
    setUi(prev => ({ ...prev, filters: { ...prev.filters, [key]: value } }));
  };

  const resetFilters = () => {
    setUi(prev => ({
      ...prev,
      page: 0,
      filters: {
        dateFrom: '', dateTo: '',
        minPoints: '', maxPoints: '',
        minAciertos: '', maxAciertos: '',
        minCanjes: '', maxCanjes: '',
      },
    }));
  };

  const createCustomReferrer = useMutation({
    mutationFn: (data) => api.entities.User.create(data),
    onSuccess: (_, vars) => {
      queryClient.invalidateQueries({ queryKey: ['admin-users'] });
      setUi(prev => ({ ...prev, customReferrer: { open: false, name: '', code: '', points: '' } }));
      toast.success(`✅ Referidor personalizado "${vars.full_name}" creado con código "${vars.referral_code}"`);
    },
    onError: (err) => toast.error('Error al crear referidor: ' + (err?.message || err)),
  });

  const handleCreateCustomReferrer = () => {
    const { name, code, points } = ui.customReferrer;
    if (!name.trim() || !code.trim()) {
      toast.error('Nombre y código de referido son obligatorios');
      return;
    }
    // Validar que el código no exista ya
    const existing = users.find(u => u.referral_code?.toLowerCase() === code.trim().toLowerCase());
    if (existing) {
      toast.error('Ese código de referido ya existe');
      return;
    }
    const bonusAmount = parseInt(points, 10);
    if (Number.isNaN(bonusAmount) || bonusAmount < 0) {
      toast.error('Los puntos deben ser un número válido mayor o igual a 0');
      return;
    }
    const now = new Date().toISOString();
    createCustomReferrer.mutate({
      id: `${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
      email: `referrer_${code.trim().toLowerCase()}@chessking.referral`,
      full_name: name.trim(),
      role: 'user',
      referral_code: code.trim().toUpperCase(),
      referral_bonus_amount: bonusAmount,
      referral_points: 0,
      total_points: 0,
      prediction_points: 0,
      bonus_points: 0,
      profile_complete: true,
      created_date: now,
      instagram: 'referido',
      tiktok: 'referido',
    });
  };

  const handleDeleteUser = useCallback(async () => {
    const user = ui.deleteUser;
    if (!user) return;
    if (user.role === 'admin') {
      toast.error('No puedes eliminar un administrador');
      setUi(prev => ({ ...prev, deleteUser: null }));
      return;
    }
    setUi(prev => ({ ...prev, deletingUser: true }));
    try {
      const result = await api.entities.User.delete(user.id);
      queryClient.invalidateQueries({ queryKey: ['admin-users'] });
      queryClient.invalidateQueries({ queryKey: ['admin-predictions-all'] });
      queryClient.invalidateQueries({ queryKey: ['admin-redemptions-all'] });
      toast.success(`🗑️ Usuario ${user.full_name || user.email} eliminado`, {
        description: `Se eliminaron ${result.deletedPredictions} pronósticos, ${result.deletedRedemptions} canjes, ${result.deletedBonuses} bonos y ${result.deletedTickets} tickets.`,
      });
      setUi(prev => ({ ...prev, deleteUser: null, deletingUser: false }));
    } catch (err) {
      toast.error('Error al eliminar usuario: ' + err.message);
      setUi(prev => ({ ...prev, deleteUser: null, deletingUser: false }));
    }
  }, [ui.deleteUser, queryClient]);

  const hasActiveFilters = Object.values(ui.filters).some(v => v !== '');

  const filtered = useMemo(() => {
    return users.filter(u => {
      // Búsqueda por texto
      if (ui.search) {
        const s = ui.search.toLowerCase();
        if (!(
          u.full_name?.toLowerCase().includes(s) ||
          u.cedula?.toLowerCase().includes(s) ||
          u.email?.toLowerCase().includes(s) ||
          u.instagram?.toLowerCase().includes(s)
        )) return false;
      }

      // Fecha de registro
      if (ui.filters.dateFrom && u.created_date && new Date(u.created_date) < new Date(ui.filters.dateFrom)) return false;
      if (ui.filters.dateTo && u.created_date && new Date(u.created_date) > new Date(ui.filters.dateTo + 'T23:59:59')) return false;

      // Puntos
      const pts = u.total_points || 0;
      if (ui.filters.minPoints !== '' && pts < Number(ui.filters.minPoints)) return false;
      if (ui.filters.maxPoints !== '' && pts > Number(ui.filters.maxPoints)) return false;

      // Aciertos
      const aciertos = aciertosMap[u.email] || 0;
      if (ui.filters.minAciertos !== '' && aciertos < Number(ui.filters.minAciertos)) return false;
      if (ui.filters.maxAciertos !== '' && aciertos > Number(ui.filters.maxAciertos)) return false;

      // Canjes
      const canjes = canjesMap[u.email] || 0;
      if (ui.filters.minCanjes !== '' && canjes < Number(ui.filters.minCanjes)) return false;
      if (ui.filters.maxCanjes !== '' && canjes > Number(ui.filters.maxCanjes)) return false;

      return true;
    });
  }, [users, ui.search, ui.filters, aciertosMap, canjesMap]);

  const totalPages = Math.ceil(filtered.length / PAGE_SIZE);
  const paged = filtered.slice(ui.page * PAGE_SIZE, (ui.page + 1) * PAGE_SIZE);

  const exportCSV = () => {
    const headers = ['Nombre', 'Cédula', 'Correo', 'Instagram', 'TikTok', 'Puntos', 'Aciertos', 'Canjes', 'Fecha Registro'];
    const rows = filtered.map(u => [
      u.full_name || '',
      u.cedula || '',
      u.email || '',
      u.instagram ? `@${u.instagram}` : '',
      u.tiktok ? `@${u.tiktok}` : '',
      u.total_points || 0,
      aciertosMap[u.email] || 0,
      canjesMap[u.email] || 0,
      u.created_date ? new Date(u.created_date).toLocaleDateString('es-PA') : '',
    ]);
    const csvSafe = (v) => {
    const s = String(v);
    const escaped = s.replace(/\"/g, '""');
    return s.match(/^[=+\-@]/) ? `"\'${escaped}"` : `"${escaped}"`;
  };
  const csv = [headers, ...rows].map(r => r.map(csvSafe).join(',')).join('\\n');
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
    const link = document.createElement('a');
    link.href = URL.createObjectURL(blob);
    link.download = `usuarios-${new Date().toISOString().slice(0,10)}.csv`;
    link.click();
  };

  if (loadingUsers) return <p className="text-muted-foreground">Cargando...</p>;

  return (
    <div className="space-y-4">
      <UserSearchBar
        search={ui.search}
        showFilters={ui.showFilters}
        hasActiveFilters={hasActiveFilters}
        onSearchChange={(value) => setUi(prev => ({ ...prev, search: value, page: 0 }))}
        onToggleFilters={() => setUi(prev => ({ ...prev, showFilters: !prev.showFilters }))}
        onExport={exportCSV}
        onCustomReferrer={() => setUi(prev => ({ ...prev, customReferrer: { ...prev.customReferrer, open: true } }))}
      />

      {/* Panel de filtros */}
      {ui.showFilters && (
        <FiltersPanel
          filters={ui.filters}
          onFilterChange={(key, value) => { setFilter(key, value); setUi(prev => ({ ...prev, page: 0 })); }}
          onReset={resetFilters}
          hasActiveFilters={hasActiveFilters}
        />
      )}

      <p className="text-sm text-muted-foreground">{filtered.length} usuarios encontrados</p>

      <div className="space-y-2">
        {paged.map(u => (
          <UserCard
            key={u.id}
            user={u}
            aciertosMap={aciertosMap}
            canjesMap={canjesMap}
            referredCountMap={referredCountMap}
            onGrantPoints={(user) => setUi(prev => ({ ...prev, grantUser: user }))}
            onDelete={(user) => setUi(prev => ({ ...prev, deleteUser: user }))}
          />
        ))}
      </div>

      <CreateReferrerDialog
        open={ui.customReferrer.open}
        name={ui.customReferrer.name}
        code={ui.customReferrer.code}
        points={ui.customReferrer.points}
        onNameChange={(value) => setUi(prev => ({ ...prev, customReferrer: { ...prev.customReferrer, name: value } }))}
        onCodeChange={(value) => setUi(prev => ({ ...prev, customReferrer: { ...prev.customReferrer, code: value } }))}
        onPointsChange={(value) => setUi(prev => ({ ...prev, customReferrer: { ...prev.customReferrer, points: value } }))}
        onClose={() => setUi(prev => ({ ...prev, customReferrer: { open: false, name: '', code: '', points: '' } }))}
        onCreate={handleCreateCustomReferrer}
        isPending={createCustomReferrer.isPending}
      />

      {ui.grantUser && (
        <GrantPointsModal user={ui.grantUser} open={!!ui.grantUser} onClose={() => setUi(prev => ({ ...prev, grantUser: null }))} />
      )}

      <DeleteUserDialog
        user={ui.deleteUser}
        open={!!ui.deleteUser}
        aciertosMap={aciertosMap}
        canjesMap={canjesMap}
        deleting={ui.deletingUser}
        onConfirm={handleDeleteUser}
        onClose={() => setUi(prev => ({ ...prev, deleteUser: null }))}
      />

      <UserPagination
        page={ui.page}
        totalPages={totalPages}
        onPageChange={(page) => setUi(prev => ({ ...prev, page }))}
      />
    </div>
  );
}
