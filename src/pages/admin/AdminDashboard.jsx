import React, { useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { api } from '@/api/client';
import StatsCards from '@/components/admin/StatsCards';
import MatchParticipationChart from '@/components/admin/MatchParticipationChart';
import TopUsersChart from '@/components/admin/TopUsersChart';
import DailyRegistrationsChart from '@/components/admin/DailyRegistrationsChart';
import DailyWinnersChart from '@/components/admin/DailyWinnersChart';
import { Button } from '@/components/ui/button';
import { RefreshCw, CloudUpload } from 'lucide-react';
import { toast } from 'sonner';
import { db } from '@/lib/db';

export default function AdminDashboard() {
  const queryClient = useQueryClient();
  const [recalcLoading, setRecalcLoading] = useState(false);

  const { data: users = [] } = useQuery({ queryKey: ['admin-users'], queryFn: () => api.entities.User.list() });
  const { data: matches = [] } = useQuery({ queryKey: ['admin-matches'], queryFn: () => api.entities.Match.list('-match_date') });
  const { data: predictions = [] } = useQuery({ queryKey: ['admin-predictions'], queryFn: () => api.entities.Prediction.list('-created_date') });
  const { data: redemptions = [] } = useQuery({ queryKey: ['admin-redemptions'], queryFn: () => api.entities.Redemption.list('-created_date') });

  const stats = {
    users: users.length,
    matches: matches.length,
    predictions: predictions.length,
    redemptions: redemptions.length,
  };

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

      <div className="grid md:grid-cols-2 gap-4">
        <MatchParticipationChart matches={matches} predictions={predictions} />
        <TopUsersChart users={users} />
      </div>
    </div>
  );
}