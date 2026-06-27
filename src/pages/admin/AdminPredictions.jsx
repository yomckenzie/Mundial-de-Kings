import React, { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { api } from '@/api/client';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Badge } from '@/components/ui/badge';
import { CheckCircle2, X, Download, FileText, Search } from 'lucide-react';
import { toast } from 'sonner';
import { usersByEmailMap, buildMatchReport, buildStandings, buildGlobalStats, statusOf } from '@/lib/predictionsReport';
import { exportMatchPdf, exportTotalPdf } from '@/lib/predictionsPdf';

export default function AdminPredictions() {
  const [selectedMatch, setSelectedMatch] = useState('all');
  const [mode, setMode] = useState('match');               // 'match' | 'user'
  const [statusFilter, setStatusFilter] = useState('all'); // all | ganó | perdió | pendiente
  const [search, setSearch] = useState('');

  const { data: matches = [] } = useQuery({
    queryKey: ['admin-matches-pred'],
    queryFn: () => api.entities.Match.list('-match_date'),
  });
  const { data: allPredictions = [], isLoading } = useQuery({
    queryKey: ['admin-predictions-all'],
    queryFn: () => api.entities.Prediction.list(),
  });
  const { data: users = [] } = useQuery({
    queryKey: ['admin-users-pred'],
    queryFn: () => api.entities.User.list(),
  });

  const matchMap = React.useMemo(() => {
    const m = {}; matches.forEach(x => { m[x.id] = x; }); return m;
  }, [matches]);
  const usersMap = React.useMemo(() => usersByEmailMap(users), [users]);

  const matchPredictions = React.useMemo(() => (
    selectedMatch === 'all' ? allPredictions : allPredictions.filter(p => p.match_id === selectedMatch)
  ), [allPredictions, selectedMatch]);

  const matchesText = React.useCallback((email) => {
    const u = usersMap.get(email) || {};
    const q = search.trim().toLowerCase();
    if (!q) return true;
    return (u.instagram || '').toLowerCase().includes(q)
      || (u.name || '').toLowerCase().includes(q)
      || email.toLowerCase().includes(q);
  }, [usersMap, search]);

  const filteredRows = React.useMemo(() => {
    const rows = [];
    for (const p of matchPredictions) {
      if (!matchesText(p.user_email)) continue;
      const match = matchMap[p.match_id];
      const st = match ? statusOf(p, match) : 'pendiente';
      if (statusFilter !== 'all' && st !== statusFilter) continue;
      rows.push({ p, match, st });
    }
    rows.sort((a, b) => (a.p.created_date || '').localeCompare(b.p.created_date || ''));
    return rows;
  }, [matchPredictions, statusFilter, matchMap, matchesText]);

  const standings = React.useMemo(
    () => buildStandings(allPredictions, matches, usersMap).filter(s => matchesText(s.email)),
    [allPredictions, matches, usersMap, matchesText]
  );

  const handleExportCsv = () => {
    if (filteredRows.length === 0) { toast.error('No hay pronósticos para exportar'); return; }
    const csvCell = (v) => { const s = String(v ?? ''); return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s; };
    const headers = ['Partido', 'Instagram', 'Nombre', 'Correo', 'Pronóstico', 'Estado', 'Puntos'];
    const rows = filteredRows.map(({ p, match, st }) => {
      const u = usersMap.get(p.user_email) || {};
      const partido = match ? `${match.team1} vs ${match.team2}` : 'Desconocido';
      const puntos = p.scored ? (p.points_earned ?? (p.is_correct ? 100 : 0)) : (st === 'ganó' ? 100 : 0);
      return [partido, u.instagram ? '@' + u.instagram : '', u.name || '', p.user_email, `${p.pred_team1} - ${p.pred_team2}`, st, puntos];
    });
    const csv = [headers, ...rows].map(r => r.map(csvCell).join(',')).join('\r\n');
    const blob = new Blob(['﻿' + csv], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    const nombre = selectedMatch !== 'all' && matchMap[selectedMatch]
      ? `${matchMap[selectedMatch].team1}_vs_${matchMap[selectedMatch].team2}`.replace(/\s+/g, '') : 'todos';
    a.href = url; a.download = `pronosticos_${nombre}.csv`;
    document.body.appendChild(a); a.click(); document.body.removeChild(a);
    URL.revokeObjectURL(url);
    toast.success(`Exportados ${filteredRows.length} pronósticos`);
  };

  const handleMatchPdf = () => {
    const match = matchMap[selectedMatch];
    if (!match) { toast.error('Selecciona un partido para el PDF'); return; }
    const report = buildMatchReport(match, allPredictions, usersMap);
    if (report.rows.length === 0) { toast.error('Ese partido no tiene pronósticos'); return; }
    exportMatchPdf(report);
    toast.success('PDF del partido generado');
  };

  const handleTotalPdf = () => {
    const finished = matches.filter(m => m.status === 'finished' && m.result_team1 != null && m.result_team2 != null);
    if (finished.length === 0) { toast.error('No hay partidos finalizados todavía'); return; }
    const globalStats = buildGlobalStats(allPredictions, finished, usersMap);
    const matchReports = finished.map(m => buildMatchReport(m, allPredictions, usersMap));
    const standingsAll = buildStandings(allPredictions, matches, usersMap);
    exportTotalPdf({ globalStats, matchReports, standings: standingsAll });
    toast.success('PDF total generado');
  };

  const userLabel = (email) => {
    const u = usersMap.get(email) || {};
    return u.instagram ? '@' + u.instagram : (u.name || email);
  };

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-2">
        <div className="inline-flex rounded-lg border p-0.5">
          <button type="button" onClick={() => setMode('match')} className={`px-3 py-1 text-sm rounded-md ${mode === 'match' ? 'bg-foreground text-background' : 'text-muted-foreground'}`}>Por partido</button>
          <button type="button" onClick={() => setMode('user')} className={`px-3 py-1 text-sm rounded-md ${mode === 'user' ? 'bg-foreground text-background' : 'text-muted-foreground'}`}>Por usuario</button>
        </div>
        <Button variant="outline" size="sm" onClick={handleTotalPdf} className="gap-2">
          <FileText className="w-4 h-4" /> PDF total
        </Button>
      </div>

      <div className="relative max-w-sm">
        <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
        <Input className="pl-9" placeholder="Buscar por @instagram, nombre o correo" value={search} onChange={(e) => setSearch(e.target.value)} />
      </div>

      {mode === 'match' ? (
        <>
          <div className="flex flex-wrap items-center gap-2">
            <Select value={selectedMatch} onValueChange={setSelectedMatch}>
              <SelectTrigger className="w-full max-w-xs"><SelectValue placeholder="Filtrar por partido" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Todos los partidos</SelectItem>
                {matches.map(m => <SelectItem key={m.id} value={m.id}>{m.team1} vs {m.team2}</SelectItem>)}
              </SelectContent>
            </Select>
            <Select value={statusFilter} onValueChange={setStatusFilter}>
              <SelectTrigger className="w-40"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Todos</SelectItem>
                <SelectItem value="ganó">Acertados</SelectItem>
                <SelectItem value="perdió">Perdidos</SelectItem>
                <SelectItem value="pendiente">Pendientes</SelectItem>
              </SelectContent>
            </Select>
            <Button variant="outline" size="sm" onClick={handleExportCsv} disabled={filteredRows.length === 0} className="gap-2">
              <Download className="w-4 h-4" /> CSV
            </Button>
            <Button variant="outline" size="sm" onClick={handleMatchPdf} disabled={selectedMatch === 'all'} className="gap-2">
              <FileText className="w-4 h-4" /> PDF de este partido
            </Button>
          </div>

          <p className="text-sm text-muted-foreground">{filteredRows.length} pronósticos</p>

          {isLoading ? <p className="text-muted-foreground">Cargando...</p> : (
            <div className="space-y-2">
              {filteredRows.map(({ p, match, st }) => (
                <Card key={p.id}>
                  <CardContent className="p-3 text-sm flex items-center justify-between">
                    <div>
                      <p className="font-medium">{userLabel(p.user_email)}</p>
                      <p className="text-muted-foreground text-xs">{p.user_email}</p>
                      <p className="text-muted-foreground">{match ? `${match.team1} vs ${match.team2}` : 'Partido desconocido'}</p>
                      <p>Pronóstico: <strong>{p.pred_team1} - {p.pred_team2}</strong></p>
                    </div>
                    {st === 'pendiente' ? (
                      <Badge variant="outline">Pendiente</Badge>
                    ) : (
                      <Badge className={st === 'ganó' ? 'bg-accent text-accent-foreground' : 'bg-muted text-muted-foreground'}>
                        {st === 'ganó'
                          ? <span className="flex items-center gap-1"><CheckCircle2 className="w-3 h-3" />+100</span>
                          : <span className="flex items-center gap-1"><X className="w-3 h-3" />0</span>}
                      </Badge>
                    )}
                  </CardContent>
                </Card>
              ))}
            </div>
          )}
        </>
      ) : (
        <>
          <p className="text-sm text-muted-foreground">{standings.length} participantes</p>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="text-left text-muted-foreground border-b">
                  <th className="py-2 pr-2">#</th><th className="pr-2">Usuario</th><th className="pr-2">Correo</th><th className="pr-2">Aciertos</th><th className="pr-2 text-right">Puntos</th>
                </tr>
              </thead>
              <tbody>
                {standings.map(s => (
                  <tr key={s.email} className="border-b last:border-0">
                    <td className="py-2 pr-2 text-muted-foreground">{s.rank}</td>
                    <td className="pr-2 font-medium">{s.instagram ? '@' + s.instagram : s.name}</td>
                    <td className="pr-2 text-muted-foreground">{s.email}</td>
                    <td className="pr-2">{s.hits}/{s.total}</td>
                    <td className="pr-2 text-right font-bold">{s.points}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </>
      )}
    </div>
  );
}
