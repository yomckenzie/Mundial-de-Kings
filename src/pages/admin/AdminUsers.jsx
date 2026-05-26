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
  const [search, setSearch] = useState('');
  const [page, setPage] = useState(0);
  const [showFilters, setShowFilters] = useState(false);
  const [grantUser, setGrantUser] = useState(null);

  // Filtros
  const [dateFrom, setDateFrom] = useState('');
  const [dateTo, setDateTo] = useState('');
  const [minPoints, setMinPoints] = useState('');
  const [maxPoints, setMaxPoints] = useState('');
  const [minAciertos, setMinAciertos] = useState('');
  const [maxAciertos, setMaxAciertos] = useState('');
  const [minCanjes, setMinCanjes] = useState('');
  const [maxCanjes, setMaxCanjes] = useState('');

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

  const resetFilters = () => {
    setDateFrom(''); setDateTo('');
    setMinPoints(''); setMaxPoints('');
    setMinAciertos(''); setMaxAciertos('');
    setMinCanjes(''); setMaxCanjes('');
    setPage(0);
  };

  const hasActiveFilters = dateFrom || dateTo || minPoints || maxPoints || minAciertos || maxAciertos || minCanjes || maxCanjes;

  const filtered = useMemo(() => {
    return users.filter(u => {
      // Búsqueda por texto
      if (search) {
        const s = search.toLowerCase();
        if (!(
          u.full_name?.toLowerCase().includes(s) ||
          u.cedula?.toLowerCase().includes(s) ||
          u.email?.toLowerCase().includes(s) ||
          u.instagram?.toLowerCase().includes(s)
        )) return false;
      }

      // Fecha de registro
      if (dateFrom && u.created_date && new Date(u.created_date) < new Date(dateFrom)) return false;
      if (dateTo && u.created_date && new Date(u.created_date) > new Date(dateTo + 'T23:59:59')) return false;

      // Puntos
      const pts = u.total_points || 0;
      if (minPoints !== '' && pts < Number(minPoints)) return false;
      if (maxPoints !== '' && pts > Number(maxPoints)) return false;

      // Aciertos
      const aciertos = aciertosMap[u.email] || 0;
      if (minAciertos !== '' && aciertos < Number(minAciertos)) return false;
      if (maxAciertos !== '' && aciertos > Number(maxAciertos)) return false;

      // Canjes
      const canjes = canjesMap[u.email] || 0;
      if (minCanjes !== '' && canjes < Number(minCanjes)) return false;
      if (maxCanjes !== '' && canjes > Number(maxCanjes)) return false;

      return true;
    });
  }, [users, search, dateFrom, dateTo, minPoints, maxPoints, minAciertos, maxAciertos, minCanjes, maxCanjes, aciertosMap, canjesMap]);

  const totalPages = Math.ceil(filtered.length / PAGE_SIZE);
  const paged = filtered.slice(page * PAGE_SIZE, (page + 1) * PAGE_SIZE);

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
    const csv = [headers, ...rows].map(r => r.map(v => `"${String(v).replace(/"/g, '""')}"`).join(',')).join('\n');
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
            value={search}
            onChange={(e) => { setSearch(e.target.value); setPage(0); }}
          />
        </div>
        <Button size="sm" variant={showFilters ? 'default' : 'outline'} onClick={() => setShowFilters(v => !v)} className="gap-1.5">
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
      {showFilters && (
        <Card>
          <CardContent className="p-4 space-y-4">
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
              <div className="space-y-1">
                <Label className="text-xs">Registro desde</Label>
                <Input type="date" value={dateFrom} onChange={e => { setDateFrom(e.target.value); setPage(0); }} />
              </div>
              <div className="space-y-1">
                <Label className="text-xs">Registro hasta</Label>
                <Input type="date" value={dateTo} onChange={e => { setDateTo(e.target.value); setPage(0); }} />
              </div>
              <div className="space-y-1">
                <Label className="text-xs">Puntos mín.</Label>
                <Input type="number" min="0" placeholder="0" value={minPoints} onChange={e => { setMinPoints(e.target.value); setPage(0); }} />
              </div>
              <div className="space-y-1">
                <Label className="text-xs">Puntos máx.</Label>
                <Input type="number" min="0" placeholder="∞" value={maxPoints} onChange={e => { setMaxPoints(e.target.value); setPage(0); }} />
              </div>
              <div className="space-y-1">
                <Label className="text-xs">Aciertos mín.</Label>
                <Input type="number" min="0" placeholder="0" value={minAciertos} onChange={e => { setMinAciertos(e.target.value); setPage(0); }} />
              </div>
              <div className="space-y-1">
                <Label className="text-xs">Aciertos máx.</Label>
                <Input type="number" min="0" placeholder="∞" value={maxAciertos} onChange={e => { setMaxAciertos(e.target.value); setPage(0); }} />
              </div>
              <div className="space-y-1">
                <Label className="text-xs">Canjes mín.</Label>
                <Input type="number" min="0" placeholder="0" value={minCanjes} onChange={e => { setMinCanjes(e.target.value); setPage(0); }} />
              </div>
              <div className="space-y-1">
                <Label className="text-xs">Canjes máx.</Label>
                <Input type="number" min="0" placeholder="∞" value={maxCanjes} onChange={e => { setMaxCanjes(e.target.value); setPage(0); }} />
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
                <Button size="sm" variant="outline" className="gap-1.5 h-7 text-xs" onClick={() => setGrantUser(u)}>
                  <Gift className="w-3 h-3" /> Otorgar puntos
                </Button>
              </div>
            </CardContent>
          </Card>
        ))}
      </div>

      {grantUser && (
        <GrantPointsModal user={grantUser} open={!!grantUser} onClose={() => setGrantUser(null)} />
      )}

      {totalPages > 1 && (
        <div className="flex items-center justify-center gap-4">
          <Button variant="outline" size="sm" disabled={page === 0} onClick={() => setPage(p => p - 1)}>
            <ChevronLeft className="w-4 h-4" />
          </Button>
          <span className="text-sm text-muted-foreground">Página {page + 1} de {totalPages}</span>
          <Button variant="outline" size="sm" disabled={page >= totalPages - 1} onClick={() => setPage(p => p + 1)}>
            <ChevronRight className="w-4 h-4" />
          </Button>
        </div>
      )}
    </div>
  );
}