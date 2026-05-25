import React, { useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { api } from '@/api/client';
import StatsCards from '@/components/admin/StatsCards';
import MatchParticipationChart from '@/components/admin/MatchParticipationChart';
import TopUsersChart from '@/components/admin/TopUsersChart';
import DailyRegistrationsChart from '@/components/admin/DailyRegistrationsChart';
import DailyWinnersChart from '@/components/admin/DailyWinnersChart';
import { Button } from '@/components/ui/button';
import { RefreshCw } from 'lucide-react';
import { toast } from 'sonner';

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

  return (
    <div className="space-y-6">
      <div className="flex justify-end">
        <Button variant="outline" size="sm" onClick={handleRecalc} disabled={recalcLoading} className="gap-2">
          <RefreshCw className={`w-4 h-4 ${recalcLoading ? 'animate-spin' : ''}`} />
          {recalcLoading ? 'Recalculando...' : 'Recalcular puntos de todos'}
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