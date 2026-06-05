import React, { useState, useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';
import { api } from '@/api/client';
import { Card, CardContent } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Search, ChevronLeft, ChevronRight, Download, Filter, X, Gift } from 'lucide-react';
import { Button } from '@/components/ui/button';
import GrantPointsModal from '@/components/admin/GrantPointsModal';

const PAGE_SIZE = 20;

export default function AdminUsers() {
  const [ui, setUi] = useState({
    search: '',
    page: 0,
    showFilters: false,
    grantUser: null,
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
      {/* Búsqueda + botones */}
      <div className="flex gap-2">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
          <Input
            placeholder="Buscar por nombre, cédula, correo o Instagram..."
            className="pl-9"
            value={ui.search}
            onChange={(e) => { setUi(prev => ({ ...prev, search: e.target.value, page: 0 })); }}
          />
        </div>
        <Button size="sm" variant={ui.showFilters ? 'default' : 'outline'} onClick={() => setUi(prev => ({ ...prev, showFilters: !prev.showFilters }))} className="gap-1.5">
          <Filter className="w-4 h-4" />
          Filtros
          {hasActiveFilters && <span className="bg-secondary text-secondary-foreground rounded-full text-xs w-4 h-4 flex items-center justify-center">!</span>}
        </Button>
        <Button size="sm" variant="outline" onClick={exportCSV} className="gap-1.5">
          <Download className="w-4 h-4" />
          CSV
        </Button>
      </div>

      {/* Panel de filtros */}
      {ui.showFilters && (
        <Card>
          <CardContent className="p-4 space-y-4">
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
              <div className="space-y-1">
                <Label className="text-xs">Registro desde</Label>
                <Input type="date" value={ui.filters.dateFrom} onChange={e => { setFilter('dateFrom', e.target.value); setUi(prev => ({ ...prev, page: 0 })); }} />
              </div>
              <div className="space-y-1">
                <Label className="text-xs">Registro hasta</Label>
                <Input type="date" value={ui.filters.dateTo} onChange={e => { setFilter('dateTo', e.target.value); setUi(prev => ({ ...prev, page: 0 })); }} />
              </div>
              <div className="space-y-1">
                <Label className="text-xs">Puntos mín.</Label>
                <Input type="number" min="0" placeholder="0" value={ui.filters.minPoints} onChange={e => { setFilter('minPoints', e.target.value); setUi(prev => ({ ...prev, page: 0 })); }} />
              </div>
              <div className="space-y-1">
                <Label className="text-xs">Puntos máx.</Label>
                <Input type="number" min="0" placeholder="∞" value={ui.filters.maxPoints} onChange={e => { setFilter('maxPoints', e.target.value); setUi(prev => ({ ...prev, page: 0 })); }} />
              </div>
              <div className="space-y-1">
                <Label className="text-xs">Aciertos mín.</Label>
                <Input type="number" min="0" placeholder="0" value={ui.filters.minAciertos} onChange={e => { setFilter('minAciertos', e.target.value); setUi(prev => ({ ...prev, page: 0 })); }} />
              </div>
              <div className="space-y-1">
                <Label className="text-xs">Aciertos máx.</Label>
                <Input type="number" min="0" placeholder="∞" value={ui.filters.maxAciertos} onChange={e => { setFilter('maxAciertos', e.target.value); setUi(prev => ({ ...prev, page: 0 })); }} />
              </div>
              <div className="space-y-1">
                <Label className="text-xs">Canjes mín.</Label>
                <Input type="number" min="0" placeholder="0" value={ui.filters.minCanjes} onChange={e => { setFilter('minCanjes', e.target.value); setUi(prev => ({ ...prev, page: 0 })); }} />
              </div>
              <div className="space-y-1">
                <Label className="text-xs">Canjes máx.</Label>
                <Input type="number" min="0" placeholder="∞" value={ui.filters.maxCanjes} onChange={e => { setFilter('maxCanjes', e.target.value); setUi(prev => ({ ...prev, page: 0 })); }} />
              </div>
            </div>
            {hasActiveFilters && (
              <Button size="sm" variant="ghost" onClick={resetFilters} className="gap-1.5 text-muted-foreground">
                <X className="w-3 h-3" /> Limpiar filtros
              </Button>
            )}
          </CardContent>
        </Card>
      )}

      <p className="text-sm text-muted-foreground">{filtered.length} usuarios encontrados</p>

      <div className="space-y-2">
        {paged.map(u => (
          <Card key={u.id}>
            <CardContent className="p-3 text-sm">
              <div className="grid grid-cols-2 md:grid-cols-4 gap-2">
                <div>
                  <p className="text-muted-foreground text-xs">Nombre</p>
                  <p className="font-medium">{u.full_name}</p>
                </div>
                <div>
                  <p className="text-muted-foreground text-xs">Cédula</p>
                  <p>{u.cedula}</p>
                </div>
                <div>
                  <p className="text-muted-foreground text-xs">Instagram</p>
                  <p>@{u.instagram}</p>
                </div>
                <div>
                  <p className="text-muted-foreground text-xs">Puntos</p>
                  <p className="font-bold">{u.total_points || 0}</p>
                  <p className="text-xs text-muted-foreground">🎯 {u.prediction_points || 0} · 🎁 {u.bonus_points || 0}</p>
                </div>
              </div>
              <div className="grid grid-cols-2 md:grid-cols-4 gap-2 mt-2">
                <div>
                  <p className="text-muted-foreground text-xs">Correo</p>
                  <p>{u.email}</p>
                </div>
                <div>
                  <p className="text-muted-foreground text-xs">TikTok</p>
                  <p>@{u.tiktok}</p>
                </div>
                <div>
                  <p className="text-muted-foreground text-xs">Aciertos</p>
                  <p className="font-medium">{aciertosMap[u.email] || 0}</p>
                </div>
                <div>
                  <p className="text-muted-foreground text-xs">Canjes</p>
                  <p className="font-medium">{canjesMap[u.email] || 0}</p>
                </div>
              </div>
              <div className="mt-1 flex items-center justify-between">
                <p className="text-muted-foreground text-xs">Registro: {u.created_date ? new Date(u.created_date).toLocaleDateString('es-PA') : '-'}</p>
                <Button size="sm" variant="outline" className="gap-1.5 h-7 text-xs" onClick={() => setUi(prev => ({ ...prev, grantUser: u }))}>
                  <Gift className="w-3 h-3" /> Otorgar puntos
                </Button>
              </div>
            </CardContent>
          </Card>
        ))}
      </div>

      {ui.grantUser && (
        <GrantPointsModal user={ui.grantUser} open={!!ui.grantUser} onClose={() => setUi(prev => ({ ...prev, grantUser: null }))} />
      )}

      {totalPages > 1 && (
        <div className="flex items-center justify-center gap-4">
          <Button variant="outline" size="sm" disabled={ui.page === 0} onClick={() => setUi(prev => ({ ...prev, page: prev.page - 1 }))}>
            <ChevronLeft className="w-4 h-4" />
          </Button>
          <span className="text-sm text-muted-foreground">Página {ui.page + 1} de {totalPages}</span>
          <Button variant="outline" size="sm" disabled={ui.page >= totalPages - 1} onClick={() => setUi(prev => ({ ...prev, page: prev.page + 1 }))}>
            <ChevronRight className="w-4 h-4" />
          </Button>
        </div>
      )}
    </div>
  );
}
