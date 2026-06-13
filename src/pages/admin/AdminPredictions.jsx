import React, { useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { api } from '@/api/client';
import { db } from '@/lib/db';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Badge } from '@/components/ui/badge';
import { CheckCircle2, X, Layers, Download } from 'lucide-react';
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

  // Escapa un valor para CSV: entrecomilla si tiene coma, comilla o salto de línea.
  const csvCell = (v) => {
    const s = String(v ?? '');
    return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
  };

  // Exporta los pronósticos actualmente filtrados a un CSV (correo, pronóstico,
  // resultado real, ganó/perdió, puntos). Pensado para usar con un partido
  // seleccionado, para saber quién ganó y quién perdió.
  const handleExportCsv = () => {
    if (predictions.length === 0) {
      toast.error('No hay pronósticos para exportar');
      return;
    }
    const headers = ['Partido', 'Correo', 'Pronóstico', 'Resultado', 'Estado', 'Puntos'];
    const rows = predictions.map((pred) => {
      const match = matchMap[pred.match_id];
      const partido = match ? `${match.team1} vs ${match.team2}` : 'Partido desconocido';
      const pronostico = `${pred.pred_team1} - ${pred.pred_team2}`;
      const resultado = match && match.result_team1 != null && match.result_team2 != null
        ? `${match.result_team1} - ${match.result_team2}`
        : 'Sin publicar';
      const estado = pred.scored ? (pred.is_correct ? 'Ganó' : 'Perdió') : 'Pendiente';
      const puntos = pred.scored ? (pred.points_earned ?? (pred.is_correct ? 100 : 0)) : '';
      return [partido, pred.user_email, pronostico, resultado, estado, puntos];
    });
    const csv = [headers, ...rows]
      .map((row) => row.map(csvCell).join(','))
      .join('\r\n');
    // BOM (﻿) para que Excel abra el archivo como UTF-8 (acentos y ñ).
    const blob = new Blob(['﻿' + csv], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    const nombre = selectedMatch !== 'all' && matchMap[selectedMatch]
      ? `${matchMap[selectedMatch].team1}_vs_${matchMap[selectedMatch].team2}`.replace(/\s+/g, '')
      : 'todos';
    a.href = url;
    a.download = `pronosticos_${nombre}.csv`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
    toast.success(`Exportados ${predictions.length} pronósticos`);
  };

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
        <Button variant="outline" size="sm" onClick={handleExportCsv} disabled={predictions.length === 0} className="gap-2">
          <Download className="w-4 h-4" /> Exportar CSV
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