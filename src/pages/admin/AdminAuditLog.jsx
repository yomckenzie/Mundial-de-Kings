import React, { useState, useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';
import { api } from '@/api/client';
import { Card, CardContent } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Search, ChevronLeft, ChevronRight, Trash2, ShieldAlert } from 'lucide-react';
import { Button } from '@/components/ui/button';

const PAGE_SIZE = 30;

export default function AdminAuditLog() {
  const [search, setSearch] = useState('');
  const [page, setPage] = useState(0);

  const { data: logs = [], isLoading } = useQuery({
    queryKey: ['admin-audit-logs'],
    queryFn: () => api.entities.AuditLog.list('-created_date'),
  });

  const filtered = useMemo(() => {
    if (!search) return logs;
    const s = search.toLowerCase();
    return logs.filter(l =>
      l.admin_email?.toLowerCase().includes(s) ||
      l.admin_name?.toLowerCase().includes(s) ||
      l.deleted_user_email?.toLowerCase().includes(s) ||
      l.deleted_user_name?.toLowerCase().includes(s) ||
      l.deleted_user_instagram?.toLowerCase().includes(s)
    );
  }, [logs, search]);

  const totalPages = Math.ceil(filtered.length / PAGE_SIZE);
  const paged = filtered.slice(page * PAGE_SIZE, (page + 1) * PAGE_SIZE);

  if (isLoading) return <p className="text-muted-foreground">Cargando...</p>;

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-2">
        <ShieldAlert className="w-5 h-5 text-muted-foreground" />
        <p className="text-sm text-muted-foreground">
          Registro de eliminaciones de usuarios realizadas por administradores.
        </p>
      </div>

      <div className="relative flex-1 max-w-sm">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
        <Input
          placeholder="Buscar por admin o usuario..."
          className="pl-9"
          value={search}
          onChange={(e) => { setSearch(e.target.value); setPage(0); }}
        />
      </div>

      <p className="text-sm text-muted-foreground">{filtered.length} registros encontrados</p>

      <div className="space-y-2">
        {paged.length === 0 ? (
          <p className="text-sm text-muted-foreground text-center py-8">No hay registros de eliminaciones.</p>
        ) : (
          paged.map(l => {
            let details = {};
            try { details = JSON.parse(l.details || '{}'); } catch {}

            return (
              <Card key={l.id}>
                <CardContent className="p-3 text-sm">
                  <div className="flex items-start gap-3">
                    <div className="bg-destructive/10 rounded-full p-2 mt-0.5 flex-shrink-0">
                      <Trash2 className="w-4 h-4 text-destructive" />
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className="font-medium text-destructive">Usuario eliminado</span>
                        <span className="text-xs text-muted-foreground">
                          {new Date(l.created_date).toLocaleString('es-PA')}
                        </span>
                      </div>
                      <div className="mt-1 grid grid-cols-1 sm:grid-cols-2 gap-x-4 gap-y-0.5">
                        <p className="text-muted-foreground text-xs">
                          Usuario: <span className="text-foreground font-medium">{l.deleted_user_name}</span>
                          {l.deleted_user_instagram && <span className="text-muted-foreground"> @{l.deleted_user_instagram}</span>}
                        </p>
                        <p className="text-muted-foreground text-xs">
                          Email: <span className="text-foreground">{l.deleted_user_email}</span>
                        </p>
                        <p className="text-muted-foreground text-xs">
                          Eliminado por: <span className="text-foreground">{l.admin_name}</span>
                        </p>
                        <p className="text-muted-foreground text-xs">
                          Admin: <span className="text-foreground">{l.admin_email}</span>
                        </p>
                      </div>
                      {Object.keys(details).length > 0 && (
                        <div className="mt-1.5 flex gap-3 text-xs text-muted-foreground">
                          {details.deletedPredictions > 0 && <span>🗳️ {details.deletedPredictions} pronósticos</span>}
                          {details.deletedRedemptions > 0 && <span>🎁 {details.deletedRedemptions} canjes</span>}
                          {details.deletedBonuses > 0 && <span>⭐ {details.deletedBonuses} bonos</span>}
                          {details.deletedTickets > 0 && <span>🎫 {details.deletedTickets} tickets</span>}
                        </div>
                      )}
                    </div>
                  </div>
                </CardContent>
              </Card>
            );
          })
        )}
      </div>

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
