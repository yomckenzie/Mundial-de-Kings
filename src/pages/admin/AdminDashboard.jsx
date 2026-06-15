import React, { useState, useMemo } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { api } from '@/api/client';
import StatsCards from '@/components/admin/StatsCards';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { MatchParticipationChart, TopUsersChart, DailyRegistrationsChart, DailyWinnersChart } from '@/components/admin/charts';
import { Button } from '@/components/ui/button';
import { RefreshCw, CloudUpload, UserPlus, Users, Trophy } from 'lucide-react';
import { toast } from 'sonner';
import { db } from '@/lib/db';

export default function AdminDashboard() {
  const queryClient = useQueryClient();
  const [recalcLoading, setRecalcLoading] = useState(false);

  const { data: users = [] } = useQuery({ queryKey: ['admin-users'], queryFn: () => api.entities.User.list() });
  const { data: matches = [] } = useQuery({ queryKey: ['admin-matches'], queryFn: () => api.entities.Match.list('-match_date') });
  const { data: predictions = [] } = useQuery({ queryKey: ['admin-predictions'], queryFn: () => api.entities.Prediction.list('-created_date') });
  const { data: redemptions = [] } = useQuery({ queryKey: ['admin-redemptions'], queryFn: () => api.entities.Redemption.list('-created_date') });
  const { data: referrals = [] } = useQuery({ queryKey: ['admin-referrals'], queryFn: () => api.entities.Referral.list() });

  const stats = {
    users: users.length,
    matches: matches.length,
    predictions: predictions.length,
    redemptions: redemptions.length,
  };

  // Top referentes: usuarios que más personas han referido
  const topReferrers = useMemo(() => {
    const countMap = {};
    referrals.forEach(r => { countMap[r.referrer_email] = (countMap[r.referrer_email] || 0) + 1; });
    return Object.entries(countMap)
      .reduce((acc, [email, count]) => {
        const user = users.find(u => u.email === email);
        if (user) acc.push({ user, email, count });
        return acc;
      }, [])
      .sort((a, b) => b.count - a.count)
      .slice(0, 5);
  }, [referrals, users]);

  const handleRecalc = async () => {
    setRecalcLoading(true);
    const res = await api.functions.invoke('recalcUserPoints', {});
    setRecalcLoading(false);
    if (res.data?.success) {
      toast.success(`Puntos recalculados: ${res.data.updated} usuarios actualizados`);
      queryClient.invalidateQueries({ queryKey: ['admin-users'] });
      queryClient.invalidateQueries({ queryKey: ['ranking'] });
    } else {
      toast.error(res.data?.error || 'Error al recalcular');
    }
  };

  // NOTA: el botón "Limpiar datos usuarios" se retiró del panel por seguridad —
  // borraba de un clic todos los usuarios, pronósticos, canjes, puntos, tickets
  // y referidos (acción irreversible).

  const [syncLoading, setSyncLoading] = useState(false);

  const handleSyncToCloud = async () => {
    setSyncLoading(true);
    try {
      const result = await db.syncToCloud();
      if (result.success) {
        const total = result.results.reduce((sum, r) => sum + r.count, 0);
        const errores = result.results.filter(r => r.status === 'error');
        if (errores.length > 0) {
          toast.warning(`Sincronizado: ${total} registros enviados. ${errores.length} tabla(s) con errores.`);
        } else {
          toast.success(`✅ ${total} registros sincronizados a Supabase correctamente`);
        }
      } else {
        toast.error(result.error || 'Error al sincronizar');
      }
    } catch (err) {
      toast.error('Error inesperado al sincronizar');
    }
    setSyncLoading(false);
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-end gap-2">
        <Button variant="outline" size="sm" onClick={handleSyncToCloud} disabled={syncLoading} className="gap-2">
          <CloudUpload className={`w-4 h-4 ${syncLoading ? 'animate-bounce' : ''}`} />
          {syncLoading ? 'Sincronizando...' : 'Sincronizar a la nube'}
        </Button>
        <Button variant="outline" size="sm" onClick={handleRecalc} disabled={recalcLoading} className="gap-2">
          <RefreshCw className={`w-4 h-4 ${recalcLoading ? 'animate-spin' : ''}`} />
          {recalcLoading ? 'Recalculando...' : 'Recalcular puntos'}
        </Button>
      </div>
      <StatsCards stats={stats} />

      <div className="grid md:grid-cols-2 gap-4">
        <DailyRegistrationsChart users={users} />
        <DailyWinnersChart predictions={predictions} />
      </div>

      {/* Referral stats */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <Card>
          <CardContent className="p-4 flex items-center gap-3">
            <UserPlus className="w-8 h-8 text-indigo-500" />
            <div>
              <p className="text-2xl font-bold">{referrals.length}</p>
              <p className="text-xs text-muted-foreground">Total referidos</p>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4 flex items-center gap-3">
            <Users className="w-8 h-8 text-pink-500" />
            <div>
              <p className="text-2xl font-bold">{topReferrers.length > 0 ? topReferrers[0].count : 0}</p>
              <p className="text-xs text-muted-foreground">Mayor red</p>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Top referentes */}
      {topReferrers.length > 0 && (
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-base flex items-center gap-2">
              <Trophy className="w-4 h-4" />
              Top usuarios que más refieren
            </CardTitle>
          </CardHeader>
          <CardContent className="p-0">
            <div className="divide-y divide-border/50">
              {topReferrers.map((r, i) => (
                <div key={r.email} className="px-4 py-3 flex items-center justify-between gap-2">
                  <div className="flex items-center gap-3">
                    <span className="text-lg font-black text-muted-foreground w-6">#{i + 1}</span>
                    <div>
                      <p className="text-sm font-medium">{r.user?.full_name || r.email}</p>
                      <p className="text-xs text-muted-foreground">@{r.user?.instagram || '—'} · Código: {r.user?.referral_code || '—'}</p>
                    </div>
                  </div>
                  <div className="text-right">
                    <p className="font-bold text-lg">{r.count}</p>
                    <p className="text-xs text-muted-foreground">referidos</p>
                  </div>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      )}

      <div className="grid md:grid-cols-2 gap-4">
        <MatchParticipationChart matches={matches} predictions={predictions} />
        <TopUsersChart users={users} />
      </div>
    </div>
  );
}