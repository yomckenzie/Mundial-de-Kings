import React, { useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { api } from '@/api/client';
import { db } from '@/lib/db';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Badge } from '@/components/ui/badge';
import { CheckCircle2, X, Layers } from 'lucide-react';
import { toast } from 'sonner';

export default function AdminPredictions() {
  const [selectedMatch, setSelectedMatch] = useState('all');
  const [deduping, setDeduping] = useState(false);
  const queryClient = useQueryClient();

  const { data: matches = [] } = useQuery({
    queryKey: ['admin-matches-pred'],
    queryFn: () => api.entities.Match.list('-match_date'),
  });

  const { data: predictions = [], isLoading } = useQuery({
    queryKey: ['admin-predictions', selectedMatch],
    queryFn: () => {
      if (selectedMatch === 'all') return api.entities.Prediction.list('-created_date', 100);
      return api.entities.Prediction.filter({ match_id: selectedMatch }, '-created_date');
    },
  });

  const matchMap = {};
  matches.forEach(m => { matchMap[m.id] = m; });

  const handleDedupe = async () => {
    if (!window.confirm('¿Eliminar pronósticos duplicados (mismo usuario + mismo partido)?\n\nSe conservará la versión con más información (scored + puntos).')) return;
    setDeduping(true);
    try {
      const result = await db.predictions.deduplicate();
      if (result.deleted === 0) {
        toast.success('No se encontraron pronósticos duplicados ✅');
      } else {
        toast.success(`🧹 ${result.deleted} pronósticos duplicados eliminados (de ${result.scanned} revisados)`);
      }
      queryClient.invalidateQueries({ queryKey: ['admin-predictions'] });
      queryClient.invalidateQueries({ queryKey: ['ranking'] });
    } catch (e) {
      toast.error('Error al deduplicar: ' + e.message);
    } finally {
      setDeduping(false);
    }
  };

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-2">
        <Select value={selectedMatch} onValueChange={setSelectedMatch}>
          <SelectTrigger className="w-full max-w-sm">
            <SelectValue placeholder="Filtrar por partido" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Todos los partidos</SelectItem>
            {matches.map(m => (
              <SelectItem key={m.id} value={m.id}>{m.team1} vs {m.team2}</SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Button variant="secondary" size="sm" onClick={handleDedupe} disabled={deduping} className="gap-2">
          <Layers className="w-4 h-4" /> {deduping ? 'Deduplicando...' : 'Deduplicar pronósticos'}
        </Button>
      </div>

      <p className="text-sm text-muted-foreground">{predictions.length} pronósticos</p>

      {isLoading ? (
        <p className="text-muted-foreground">Cargando...</p>
      ) : (
        <div className="space-y-2">
          {predictions.map(pred => {
            const match = matchMap[pred.match_id];
            return (
              <Card key={pred.id}>
                <CardContent className="p-3 text-sm flex items-center justify-between">
                  <div>
                    <p className="font-medium">{pred.user_email}</p>
                    <p className="text-muted-foreground">
                      {match ? `${match.team1} vs ${match.team2}` : 'Partido desconocido'}
                    </p>
                    <p>Pronóstico: <strong>{pred.pred_team1} - {pred.pred_team2}</strong></p>
                  </div>
                  {pred.scored ? (
                    <Badge className={pred.is_correct ? 'bg-accent text-accent-foreground' : 'bg-muted text-muted-foreground'}>
                      {pred.is_correct ? (
                        <span className="flex items-center gap-1"><CheckCircle2 className="w-3 h-3" />+100</span>
                      ) : (
                        <span className="flex items-center gap-1"><X className="w-3 h-3" />0</span>
                      )}
                    </Badge>
                  ) : (
                    <Badge variant="outline">Pendiente</Badge>
                  )}
                </CardContent>
              </Card>
            );
          })}
        </div>
      )}
    </div>
  );
}