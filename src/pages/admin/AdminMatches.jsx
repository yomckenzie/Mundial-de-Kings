import React, { useState, useEffect, useMemo } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { api } from '@/api/client';
import { seedAllMatches } from '@/api/seedMatches';
import { syncWithBestSource, checkAllSources, refreshStatus } from '@/api/dataSources';

import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Plus, Save, Calendar, Clock, Trash2, Database, Wifi, RefreshCw, Zap, Globe, UserCheck, ChevronDown, ChevronUp } from 'lucide-react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { format, parse } from 'date-fns';
import { es } from 'date-fns/locale';
import { toast } from 'sonner';
import { motion, AnimatePresence } from 'framer-motion';

const LOCK_HOURS = 24;

/** Retorna true si el partido está bloqueado (24h+ después de su fecha/hora) */
function isMatchLocked(match) {
  if (!match.match_date) return false;
  if (match.status !== 'finished' && match.status !== 'live') {
    // Solo se bloquean partidos que ya deberían haberse jugado
  }
  const matchDate = new Date(`${match.match_date}T${match.match_time || '23:59'}:00`);
  if (isNaN(matchDate.getTime())) return false;
  const now = new Date();
  const hoursSince = (now - matchDate) / (1000 * 60 * 60);
  return hoursSince >= LOCK_HOURS;
}

const INITIAL = { team1: '', team2: '', match_date: '', match_time: '', group_stage: '', status: 'open' };

export default function AdminMatches() {
  const queryClient = useQueryClient();
  const [form, setForm] = useState(INITIAL);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [resultForm, setResultForm] = useState({});
  const [syncing, setSyncing] = useState(false);
  const [sources, setSources] = useState([]);
  const [sourcesLoading, setSourcesLoading] = useState(true);
  const [showSources, setShowSources] = useState(true);
  const [bulkResults, setBulkResults] = useState({});

  // ── Datos de partidos (deben declararse ANTES del useEffect que los usa) ──
  const { data: rawMatches = [], isLoading } = useQuery({
    queryKey: ['admin-matches-sorted'],
    queryFn: () => api.entities.Match.list(),
  });

  const matches = React.useMemo(() =>
    [...rawMatches].sort((a, b) => {
      if (a.match_date !== b.match_date) return a.match_date?.localeCompare(b.match_date);
      return (a.match_time || '').localeCompare(b.match_time || '');
    }), [rawMatches]);

  // Pre-fill resultForm con resultados existentes para poder editarlos
  useEffect(() => {
    setResultForm(prev => {
      let changed = false;
      const next = { ...prev };
      matches.forEach(m => {
        const hasT1 = m.result_team1 !== undefined && m.result_team1 !== null;
        const hasT2 = m.result_team2 !== undefined && m.result_team2 !== null;
        if ((hasT1 || hasT2) && !next[m.id]) {
          next[m.id] = {
            team1: hasT1 ? String(m.result_team1) : '',
            team2: hasT2 ? String(m.result_team2) : '',
          };
          changed = true;
        }
      });
      return changed ? next : prev;
    });
  }, [matches]);

  // Cargar fuentes al montar
  useEffect(() => {
    loadSources();
  }, []);

  const loadSources = async () => {
    setSourcesLoading(true);
    const results = await checkAllSources();
    setSources(results);
    setSourcesLoading(false);
  };

  const handleSyncNow = async () => {
    setSyncing(true);
    try {
      const result = await syncWithBestSource();
      refreshStatus();
      await loadSources();
      queryClient.invalidateQueries({ queryKey: ['admin-matches'] });
      queryClient.invalidateQueries({ queryKey: ['admin-matches-sorted'] });

      if (result.source === 'manual' && (!result.errors || result.errors.length === 0)) {
        toast.info('Sin fuente automática. Ingresa resultados manualmente abajo.');
      } else if (result.updated > 0) {
        toast.success(`✅ ${result.updated} resultados actualizados vía ${result.source}`);
      } else if (result.synced > 0) {
        toast.success(`✓ ${result.synced} revisados — sin cambios`);
      } else if (result.error) {
        toast.error(result.error);
      } else {
        toast('Sin novedades');
      }
    } catch (e) {
      toast.error('Error de sincronización: ' + e.message);
    } finally {
      setSyncing(false);
    }
  };

  const lockedMatches = useMemo(() => matches.filter(isMatchLocked), [matches]);
  const hasLockedMatches = lockedMatches.length > 0;

  const clearMatches = useMutation({
    mutationFn: () => api.entities.Match.clearAll(),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['admin-matches'] });
      queryClient.invalidateQueries({ queryKey: ['admin-matches-sorted'] });
      toast.success('Todos los partidos eliminados');
    },
  });

  const seedMutation = useMutation({
    mutationFn: () => seedAllMatches(api),
    onSuccess: (created) => {
      queryClient.invalidateQueries({ queryKey: ['admin-matches'] });
      queryClient.invalidateQueries({ queryKey: ['admin-matches-sorted'] });
      toast.success(`✅ ¡${created.length} partidos del Mundial 2026 creados!`);
    },
    onError: (err) => toast.error(err?.message || 'Error al seedear partidos'),
  });

  const handleClearAll = () => {
    if (hasLockedMatches) {
      toast.error(`No puedes eliminar partidos. Hay ${lockedMatches.length} partido${lockedMatches.length > 1 ? 's' : ''} bloqueado${lockedMatches.length > 1 ? 's' : ''} (pasaron 24h+).`);
      return;
    }
    if (window.confirm('¿Eliminar TODOS los partidos? Esta acción no se puede deshacer.')) {
      clearMatches.mutate();
    }
  };

  const createMatch = useMutation({
    mutationFn: (data) => api.entities.Match.create(data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['admin-matches'] });
      setForm(INITIAL);
      setDialogOpen(false);
      toast.success('Partido creado');
    },
  });

  const updateMatch = useMutation({
    mutationFn: ({ id, data }) => api.entities.Match.update(id, data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['admin-matches'] });
      toast.success('Partido actualizado');
    },
  });

  const handleStatusChange = (match, newStatus) => {
    updateMatch.mutate({ id: match.id, data: { status: newStatus } });
  };

  const handlePublishResult = async (match) => {
    const r = resultForm[match.id];
    if (r?.team1 === undefined || r?.team2 === undefined || r.team1 === '' || r.team2 === '') {
      toast.error('Ingresa el resultado de ambos equipos');
      return;
    }

    const resultTeam1 = Number(r.team1);
    const resultTeam2 = Number(r.team2);

    const isCorrection = match.status === 'finished';

    // Si ya estaba finalizado, revertir puntos de pronósticos acertados primero
    if (isCorrection) {
      const oldPreds = await api.entities.Prediction.filter({ match_id: match.id });
      for (const pred of oldPreds) {
        if (pred.scored && (pred.points_earned || 0) > 0) {
          const users = await api.entities.User.filter({ email: pred.user_email });
          if (users.length > 0) {
            const u = users[0];
            await api.entities.User.update(u.id, {
              total_points: Math.max(0, (u.total_points || 0) - (pred.points_earned || 0)),
              prediction_points: Math.max(0, (u.prediction_points || 0) - (pred.points_earned || 0)),
            });
          }
        }
      }
    }

    await api.entities.Match.update(match.id, {
      result_team1: resultTeam1,
      result_team2: resultTeam2,
      status: 'finished',
    });

    const predictions = await api.entities.Prediction.filter({ match_id: match.id });
    for (const pred of predictions) {
      // Si es corrección, re-evaluar todos (incluso los ya scorados)
      // Si es primera vez, solo evaluar los no scorados
      if (!isCorrection && pred.scored) continue;

      const isCorrect = pred.pred_team1 === resultTeam1 && pred.pred_team2 === resultTeam2;
      const pointsEarned = isCorrect ? 100 : 0;

      await api.entities.Prediction.update(pred.id, {
        is_correct: isCorrect,
        points_earned: pointsEarned,
        scored: true,
      });

      if (isCorrect) {
        const users = await api.entities.User.filter({ email: pred.user_email });
        if (users.length > 0) {
          const u = users[0];
          await api.entities.User.update(u.id, {
            total_points: (u.total_points || 0) + 100,
            prediction_points: (u.prediction_points || 0) + 100,
          });
        }
      }
    }

    // Limpiar resultForm para que recargue desde los datos actualizados
    setResultForm(prev => {
      const { [match.id]: _, ...rest } = prev;
      return rest;
    });

    queryClient.invalidateQueries({ queryKey: ['admin-matches'] });
    queryClient.invalidateQueries({ queryKey: ['ranking'] });
    toast.success(
      isCorrection
        ? `Resultado corregido. ${predictions.length} pronósticos re-evaluados.`
        : `Resultado publicado. ${predictions.length} pronósticos evaluados.`
    );
  };

  // Publicar resultados en batch
  const handleBatchPublish = async () => {
    const matchesToPublish = Object.entries(bulkResults)
      .filter(([_, r]) => r.team1 !== '' && r.team2 !== undefined && r.team1 !== undefined);

    if (matchesToPublish.length === 0) {
      toast.error('No hay resultados pendientes. Ingresa marcadores en los campos de la derecha.');
      return;
    }

    let published = 0;
    for (const [matchId, r] of matchesToPublish) {
      try {
        const match = matches.find(m => m.id === matchId);
        if (!match) continue;

        await api.entities.Match.update(matchId, {
          result_team1: Number(r.team1),
          result_team2: Number(r.team2),
          status: 'finished',
        });

        const predictions = await api.entities.Prediction.filter({ match_id: matchId });
        for (const pred of predictions) {
          if (pred.scored) continue;
          const isCorrect = pred.pred_team1 === Number(r.team1) && pred.pred_team2 === Number(r.team2);
          const pointsEarned = isCorrect ? 100 : 0;

          await api.entities.Prediction.update(pred.id, {
            is_correct: isCorrect,
            points_earned: pointsEarned,
            scored: true,
          });

          if (isCorrect) {
            const users = await api.entities.User.filter({ email: pred.user_email });
            if (users.length > 0) {
              const u = users[0];
              await api.entities.User.update(u.id, {
                total_points: (u.total_points || 0) + 100,
                prediction_points: (u.prediction_points || 0) + 100,
              });
            }
          }
        }
        published++;
      } catch {}
    }

    queryClient.invalidateQueries({ queryKey: ['admin-matches'] });
    setBulkResults({});
    toast.success(`✅ ${published} resultados publicados y pronósticos evaluados`);
  };

  const statusColors = {
    pending: 'bg-muted text-muted-foreground',
    open: 'bg-accent text-accent-foreground',
    live: 'bg-red-600 text-white',
    closed: 'bg-secondary text-secondary-foreground',
    finished: 'bg-muted text-muted-foreground',
  };

  const statusLabels = {
    pending: 'Pendiente',
    open: 'Abierto',
    live: 'En Vivo',
    closed: 'Cerrado',
    finished: 'Finalizado',
  };

  // Contar partidos con pronósticos pendientes
  const pendingPublishCount = Object.entries(bulkResults)
    .filter(([_, r]) => r.team1 !== '' && r.team1 !== undefined && r.team2 !== '' && r.team2 !== undefined)
    .length;

  // Agrupar partidos por fecha para mejor visualización
  const groupedMatches = matches.reduce((acc, m) => {
    const date = m.match_date || 'sin-fecha';
    if (!acc[date]) acc[date] = [];
    acc[date].push(m);
    return acc;
  }, {});

  const sortedDates = Object.keys(groupedMatches).sort();

  if (isLoading) return <p className="text-muted-foreground">Cargando panel de administración de partidos...</p>;

  const sourceIcons = {
    'api-football': <Zap className="w-4 h-4" />,
    'football-data': <Globe className="w-4 h-4" />,
    'manual': <UserCheck className="w-4 h-4" />,
  };

  const sourceColors = {
    configured_online: 'bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-400 border-emerald-200 dark:border-emerald-800',
    configured_offline: 'bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400 border-amber-200 dark:border-amber-800',
    not_configured: 'bg-muted text-muted-foreground border-border',
  };

  return (
    <div className="space-y-4">
      {/* ═══════════════════════════════════════
         PANEL DE FUENTES DE DATOS
         ═══════════════════════════════════════ */}
      <Card className="border shadow-sm">
        <CardHeader className="pb-3 cursor-pointer" onClick={() => setShowSources(!showSources)}>
          <div className="flex items-center justify-between">
            <CardTitle className="text-lg flex items-center gap-2">
              <Database className="w-5 h-5" />
              Fuentes de Datos
            </CardTitle>
            <div className="flex items-center gap-2">
              <span className="text-xs text-muted-foreground">
                {sources.find(s => s.online && s.type !== 'siempre') ? 'Automático activo' : 'Solo manual'}
              </span>
              {showSources ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
            </div>
          </div>
        </CardHeader>
        <AnimatePresence>
          {showSources && (
            <motion.div
              initial={{ height: 0, opacity: 0 }}
              animate={{ height: 'auto', opacity: 1 }}
              exit={{ height: 0, opacity: 0 }}
              transition={{ duration: 0.2 }}
            >
              <CardContent className="pt-0 space-y-3">
                {sourcesLoading ? (
                  <p className="text-sm text-muted-foreground">Verificando fuentes...</p>
                ) : (
                  <>
                    <div className="grid gap-2">
                      {sources.map((source) => {
                        let stateClass = sourceColors.not_configured;
                        let stateText = 'No configurado';
                        if (source.type === 'siempre') {
                          stateClass = 'bg-emerald-50 text-emerald-700 dark:bg-emerald-950/30 dark:text-emerald-400 border-emerald-200 dark:border-emerald-800';
                          stateText = 'Disponible';
                        } else if (source.configured && source.online) {
                          stateClass = sourceColors.configured_online;
                          stateText = 'Conectado';
                        } else if (source.configured && !source.online) {
                          stateClass = sourceColors.configured_offline;
                          stateText = 'Sin conexión';
                        }

                        return (
                          <div key={source.id} className="flex items-center justify-between p-2.5 rounded-lg border bg-card">
                            <div className="flex items-center gap-3">
                              <div className={`p-1.5 rounded-full ${stateClass}`}>
                                {sourceIcons[source.id] || <Globe className="w-4 h-4" />}
                              </div>
                              <div>
                                <div className="flex items-center gap-2">
                                  <span className="font-medium text-sm">{source.name}</span>
                                  <Badge variant="outline" className={`text-[10px] px-1.5 py-0 ${stateClass}`}>
                                    {stateText}
                                  </Badge>
                                  {source.type === 'gratis' && (
                                    <span className="text-[10px] text-emerald-600 dark:text-emerald-400 font-medium">GRATIS</span>
                                  )}
                                  {source.type === 'pago' && (
                                    <span className="text-[10px] text-amber-600 dark:text-amber-400 font-medium">PAGA</span>
                                  )}
                                </div>
                                <p className="text-xs text-muted-foreground mt-0.5">{source.desc}</p>
                                {!source.configured && source.type !== 'siempre' && (
                                  <p className="text-[10px] text-muted-foreground/60 mt-0.5 font-mono">{source.setup}</p>
                                )}
                              </div>
                            </div>
                          </div>
                        );
                      })}
                    </div>

                    {/* Botones de acción */}
                    <div className="flex flex-wrap items-center gap-2 pt-1">
                      <Button
                        size="sm"
                        variant="default"
                        onClick={handleSyncNow}
                        disabled={syncing}
                        className="gap-2"
                      >
                        <RefreshCw className={`w-4 h-4 ${syncing ? 'animate-spin' : ''}`} />
                        {syncing ? 'Sincronizando...' : 'Sincronizar resultados'}
                      </Button>
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={loadSources}
                        disabled={sourcesLoading}
                        className="gap-2"
                      >
                        <Wifi className="w-4 h-4" />
                        Verificar fuentes
                      </Button>
                    </div>
                  </>
                )}
              </CardContent>
            </motion.div>
          )}
        </AnimatePresence>
      </Card>

      {/* ═══════════════════════════════════════
         ACCIONES RÁPIDAS
         ═══════════════════════════════════════ */}
      <div className="flex flex-wrap gap-2">
        <Button
          variant="outline"
          size="sm"
          onClick={() => seedMutation.mutate()}
          disabled={seedMutation.isPending || hasLockedMatches}
          className="gap-2"
        >
          <Database className="w-4 h-4" />
          {seedMutation.isPending ? 'Sembrando...' : 'Seedear 104 partidos'}
        </Button>
        <Button
          variant="destructive"
          size="sm"
          onClick={handleClearAll}
          disabled={clearMatches.isPending || matches.length === 0}
          className="gap-2"
        >
          <Trash2 className="w-4 h-4" />
          {clearMatches.isPending ? 'Eliminando...' : 'Limpiar todos'}
        </Button>
        <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
          <DialogTrigger asChild>
            <Button className="gap-2"><Plus className="w-4 h-4" /> Crear Partido Manual</Button>
          </DialogTrigger>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Nuevo Partido</DialogTitle>
            </DialogHeader>
            <div className="space-y-3">
              <div className="grid grid-cols-2 gap-3">
                <div><Label>Equipo 1</Label><Input value={form.team1} onChange={e => setForm({...form, team1: e.target.value})} /></div>
                <div><Label>Equipo 2</Label><Input value={form.team2} onChange={e => setForm({...form, team2: e.target.value})} /></div>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div><Label>Fecha</Label><Input type="date" value={form.match_date} max="2030-12-31" onChange={e => setForm({...form, match_date: e.target.value})} /></div>
                <div><Label>Hora</Label><Input type="time" value={form.match_time} onChange={e => setForm({...form, match_time: e.target.value})} /></div>
              </div>
              <div><Label>Fase / Grupo</Label><Input placeholder="Ej: Grupo A, Octavos" value={form.group_stage} onChange={e => setForm({...form, group_stage: e.target.value})} /></div>
              <Button className="w-full" onClick={() => {
                if (form.match_date) {
                  const matchDate = new Date(`${form.match_date}T${form.match_time || '23:59'}:00`);
                  if (!isNaN(matchDate.getTime()) && matchDate < new Date()) {
                    toast.error('No puedes crear partidos en el pasado. La fecha/hora debe ser futura.');
                    return;
                  }
                }
                createMatch.mutate(form);
              }} disabled={createMatch.isPending}>
                Crear Partido
              </Button>
            </div>
          </DialogContent>
        </Dialog>
      </div>

      {/* ═══════════════════════════════════════
         PUBLICACIÓN RÁPIDA EN BATCH
         ═══════════════════════════════════════ */}
      {matches.filter(m => m.status !== 'finished').length > 0 && (
        <Card className="border-2 border-dashed border-primary/30 bg-primary/5">
          <CardContent className="p-4">
            <div className="flex items-center justify-between mb-3">
              <div className="flex items-center gap-2">
                <Zap className="w-5 h-5 text-primary" />
                <span className="font-medium text-sm">Publicación Rápida de Resultados</span>
              </div>
              {pendingPublishCount > 0 && (
                <Button size="sm" onClick={handleBatchPublish} className="gap-2">
                  <Save className="w-4 h-4" />
                  Publicar {pendingPublishCount} resultado{pendingPublishCount > 1 ? 's' : ''}
                </Button>
              )}
            </div>
            <p className="text-xs text-muted-foreground mb-2">
              Ingresa los marcadores y publica todos de una sola vez
            </p>
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2 max-h-48 overflow-y-auto">
              {matches
                .filter(m => m.status !== 'finished')
                .slice(0, 30)
                .map(match => (
                <div key={match.id} className="flex items-center gap-1.5 text-xs bg-background rounded-md p-1.5 border">
                  <span className="truncate flex-1 text-right font-medium">{match.team1}</span>
                  <Input
                    type="number"
                    min="0"
                    className="w-10 h-7 text-center text-xs px-1"
                    placeholder="0"
                    value={bulkResults[match.id]?.team1 ?? ''}
                    onChange={(e) => setBulkResults(prev => ({
                      ...prev,
                      [match.id]: { ...prev[match.id], team1: e.target.value }
                    }))}
                  />
                  <span className="text-muted-foreground">-</span>
                  <Input
                    type="number"
                    min="0"
                    className="w-10 h-7 text-center text-xs px-1"
                    placeholder="0"
                    value={bulkResults[match.id]?.team2 ?? ''}
                    onChange={(e) => setBulkResults(prev => ({
                      ...prev,
                      [match.id]: { ...prev[match.id], team2: e.target.value }
                    }))}
                  />
                  <span className="truncate flex-1 font-medium">{match.team2}</span>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      )}

      {/* ═══════════════════════════════════════
         LEYENDA DE ESTADOS
         ═══════════════════════════════════════ */}
      <Card className="border border-border/50 bg-muted/20">
        <CardContent className="p-3">
          <p className="text-xs font-medium text-muted-foreground mb-2">Estados de partido:</p>
          <div className="grid grid-cols-2 sm:grid-cols-5 gap-2 text-xs">
            <div className="flex items-center gap-1.5">
              <Badge className="bg-muted text-muted-foreground border-0 px-2 py-0.5 text-[10px]">Pendiente</Badge>
              <span className="text-muted-foreground/70">Creado, aún no abierto</span>
            </div>
            <div className="flex items-center gap-1.5">
              <Badge className="bg-accent text-accent-foreground border-0 px-2 py-0.5 text-[10px]">Abierto</Badge>
              <span className="text-muted-foreground/70">Apuestas abiertas</span>
            </div>
            <div className="flex items-center gap-1.5">
              <Badge className="bg-red-600 text-white border-0 px-2 py-0.5 text-[10px]">En Vivo</Badge>
              <span className="text-muted-foreground/70">Jugándose</span>
            </div>
            <div className="flex items-center gap-1.5">
              <Badge className="bg-secondary text-secondary-foreground border-0 px-2 py-0.5 text-[10px]">Cerrado</Badge>
              <span className="text-muted-foreground/70">Terminado, sin resultado</span>
            </div>
            <div className="flex items-center gap-1.5">
              <Badge className="bg-muted text-muted-foreground border-0 px-2 py-0.5 text-[10px]">Finalizado</Badge>
              <span className="text-muted-foreground/70">Resultado publicado</span>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* ═══════════════════════════════════════
         LISTA DE PARTIDOS
         ═══════════════════════════════════════ */}
      {sortedDates.length === 0 && (
        <div className="text-center py-12 space-y-3">
          <Calendar className="w-12 h-12 text-muted-foreground/30 mx-auto" />
          <p className="text-muted-foreground">No hay partidos. Crea uno o usa "Seedear 104 partidos".</p>
        </div>
      )}

      {sortedDates.map(dateStr => (
        <div key={dateStr}>
          <h3 className="font-display text-lg mb-2 mt-6 first:mt-0">
            {(() => {
              try {
                const d = parse(dateStr, 'yyyy-MM-dd', new Date());
                if (isNaN(d.getTime())) return dateStr;
                return format(d, "d 'de' MMMM yyyy", { locale: es });
              } catch {
                return dateStr;
              }
            })()}
            <span className="text-sm font-sans font-normal text-muted-foreground ml-2">
              ({groupedMatches[dateStr].length} partidos)
            </span>
          </h3>
          {groupedMatches[dateStr].map(match => (
            <Card key={match.id} className={`mb-2 ${match.status === 'live' ? 'ring-2 ring-red-500/50' : ''}`}>
              <CardContent className="p-4 space-y-3">
                <div className="flex items-center justify-between">
                  <div className="text-sm text-muted-foreground flex items-center gap-2">
                    <Clock className="w-4 h-4" />{match.match_time}
                    {match.group_stage && <Badge variant="outline" className="text-[10px] ml-1">{match.group_stage}</Badge>}
                  </div>
                  <Badge className={statusColors[match.status] || 'bg-muted'}>
                    {statusLabels[match.status] || match.status}
                    {match.status === 'live' && match.elapsed && ` ${match.elapsed}'`}
                  </Badge>
                </div>

                <div className="text-center font-bold text-lg">
                  {match.team1} vs {match.team2}
                  {(match.status === 'finished' || match.status === 'live') && (
                    <p className={`text-xl mt-1 ${match.status === 'live' ? 'text-red-600' : 'text-primary'}`}>
                      {match.result_team1 ?? '-'}
                      {' - '}
                      {match.result_team2 ?? '-'}
                    </p>
                  )}
                </div>

                <div className="flex flex-wrap items-center gap-2">
                  {/* Controles de estado - siempre visible */}
                  <select
                    className="text-xs border rounded-md px-2 py-1 bg-background"
                    value={match.status}
                    onChange={(e) => handleStatusChange(match, e.target.value)}
                  >
                    <option value="pending">Pendiente</option>
                    <option value="open">Abierto</option>
                    <option value="live">En Vivo</option>
                    <option value="closed">Cerrado</option>
                    <option value="finished">Finalizado</option>
                  </select>

                  {/* Resultado - siempre visible para editar o corregir */}
                  <div className="flex items-center gap-1.5 ml-auto">
                    <Input
                      type="number"
                      min="0"
                      className="w-12 h-8 text-center text-sm [appearance:textfield] [&::-webkit-inner-spin-button]:appearance-none [&::-webkit-outer-spin-button]:appearance-none"
                      placeholder="0"
                      value={resultForm[match.id]?.team1 ?? (match.result_team1 ?? '')}
                      onChange={(e) => setResultForm(prev => ({
                        ...prev,
                        [match.id]: { ...prev[match.id], team1: e.target.value }
                      }))}
                    />
                    <span className="text-muted-foreground text-sm">-</span>
                    <Input
                      type="number"
                      min="0"
                      className="w-12 h-8 text-center text-sm [appearance:textfield] [&::-webkit-inner-spin-button]:appearance-none [&::-webkit-outer-spin-button]:appearance-none"
                      placeholder="0"
                      value={resultForm[match.id]?.team2 ?? (match.result_team2 ?? '')}
                      onChange={(e) => setResultForm(prev => ({
                        ...prev,
                        [match.id]: { ...prev[match.id], team2: e.target.value }
                      }))}
                    />
                    <Button size="sm" variant={match.status === 'finished' ? 'outline' : 'secondary'} onClick={() => handlePublishResult(match)} className="h-8 text-xs">
                      <Save className="w-3 h-3 mr-1" />
                      {match.status === 'finished' ? 'Corregir' : 'Publicar'}
                    </Button>
                  </div>

                  {hasLockedMatches && isMatchLocked(match) && (
                    <Badge variant="outline" className="text-[10px] border-amber-400 text-amber-600 dark:text-amber-400 ml-auto">🔒 Bloqueado</Badge>
                  )}
                  {match.fixture_id && !isMatchLocked(match) && (
                    <span className="text-[10px] text-muted-foreground/50 ml-auto">ID: {match.fixture_id}</span>
                  )}
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      ))}
    </div>
  );
}
