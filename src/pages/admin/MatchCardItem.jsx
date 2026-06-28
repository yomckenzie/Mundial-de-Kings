import { useState } from 'react';
import { Card, CardContent } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogTrigger, DialogFooter, DialogClose } from '@/components/ui/dialog';
import { Clock, Save, RotateCcw, Pencil, Trash2 } from 'lucide-react';
import { formatTime12h } from '@/lib/utils';
import { VALID_TRANSITIONS, isValidTransition } from './matchTransitions';
import { toast } from 'sonner';

const STATUS_COLORS = {
  pending: 'bg-muted text-muted-foreground',
  open: 'bg-accent text-accent-foreground',
  live: 'bg-red-600 text-white',
  closed: 'bg-secondary text-secondary-foreground',
  finished: 'bg-muted text-muted-foreground',
};

const STATUS_LABELS = {
  pending: 'Pendiente',
  open: 'Abierto',
  live: 'En Vivo',
  closed: 'Cerrado',
  finished: 'Finalizado',
};

const STATUS_HINTS = {
  pending:  'Oculto para usuarios. Solo se muestra dentro de 48h antes del partido.',
  open:     'Visible para usuarios. Pueden enviar pronósticos.',
  live:     'Visible en sección "EN VIVO". Pronósticos cerrados.',
  closed:   'Visible en finalizados. No se aceptan pronósticos, sin resultado publicado.',
  finished: 'Visible en finalizados. Resultado publicado y predicciones evaluadas.',
};

const VISIBLE_STATUSES = new Set(['open', 'live', 'closed', 'finished']);

function isMatchLocked(match, nowMs = Date.now()) {
  const LOCK_HOURS = 24;
  if (!match.match_date) return false;
  const matchDate = new Date(`${match.match_date}T${match.match_time || '23:59'}:00`);
  if (isNaN(matchDate.getTime())) return false;
  const hoursSince = (nowMs - matchDate.getTime()) / (1000 * 60 * 60);
  return hoursSince >= LOCK_HOURS;
}

function canPublishResult(match) {
  return match.status === 'live' || match.status === 'finished';
}

// FIX (bug v2-post-28): el modelo v2 (3 picks, requiere método de cierre)
// solo aplica a partidos del 28 jun 2026 en adelante. Antes de esa fecha
// los partidos usan el modelo v1 (1 pick: ganador + marcador exacto, 100 pts)
// y NO deben pedir método al admin ni deshabilitar el botón Publicar.
const V2_ACTIVATION_DATE = '2026-06-28';
function isV2Match(match) {
  return !!match?.match_date && match.match_date >= V2_ACTIVATION_DATE;
}

// Movido fuera del componente: es un valor estático (no usa state ni props),
// reconstruirlo en cada render desperdicia trabajo y rompe memoización de hijos.
const ALL_STATUSES = ['pending', 'open', 'live', 'closed', 'finished'];

export default function MatchCardItem({ match, hasLockedMatches, results, setResults, handleStatusChange, handlePublishResult, editMatch, deleteMatch, pendingConfirm, liveResult }) {
  const handleReopen = () => {
    if (window.confirm('¿Reabrir este partido? Se limpiará el resultado y los usuarios podrán volver a pronosticar.')) {
      handleStatusChange(match, 'open');
    }
  };

  const allowedNext = VALID_TRANSITIONS[match.status] || new Set();
  const selectableStatuses = ALL_STATUSES.filter(s => s === match.status || allowedNext.has(s));
  const isV2 = isV2Match(match);

  return (
    <Card className={`mb-2 ${match.status === 'live' && !pendingConfirm ? 'ring-2 ring-red-500/50' : ''} ${pendingConfirm ? 'ring-2 ring-amber-400/70 bg-amber-50/40 dark:bg-amber-950/20' : ''}`}>
      <CardContent className="p-4 space-y-3">
        <div className="flex items-center justify-between">
          <div className="text-sm text-muted-foreground flex items-center gap-2">
            <Clock className="w-4 h-4" />{formatTime12h(match.match_time)}
            {match.group_stage && <Badge variant="outline" className="text-[10px] ml-1">{match.group_stage}</Badge>}
          </div>
          <div className="flex items-center gap-1.5">
            <Badge
              className={`${STATUS_COLORS[match.status] || 'bg-muted'} cursor-help`}
              title={STATUS_HINTS[match.status] || ''}
            >
              {STATUS_LABELS[match.status] || match.status}
            </Badge>
            {!VISIBLE_STATUSES.has(match.status) && (
              <span className="text-[10px] text-muted-foreground/70 italic">(oculto)</span>
            )}
            {pendingConfirm && (
              <Badge className="bg-amber-500 text-white border-0">Resultado por confirmar</Badge>
            )}
          </div>
        </div>

        <div className="text-center font-bold text-lg">
          {match.team1} vs {match.team2}
          {(match.status === 'finished' || match.status === 'live') && (
            <>
              <p className={`text-xl mt-1 ${match.status === 'live' ? 'text-red-600' : 'text-primary'}`}>
                {match.result_team1 ?? '-'}
                {' - '}
                {match.result_team2 ?? '-'}
              </p>
              {/* Cómo terminó — solo cuando hay resultado publicado Y método */}
              {match.result_method && (
                <p className="text-[10px] font-medium text-muted-foreground mt-0.5">
                  {match.result_method === '90' && '90 min'}
                  {match.result_method === 'et' && 'T. extra'}
                  {match.result_method === 'pen' && match.penalty_score_team1 != null && match.penalty_score_team2 != null && (
                    <>Pen ({match.penalty_score_team1}-{match.penalty_score_team2})</>
                  )}
                  {match.result_method === 'pen' && (match.penalty_score_team1 == null || match.penalty_score_team2 == null) && 'Penales'}
                </p>
              )}
            </>
          )}
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <select
            name={`status_${match.id}`}
            className="text-xs border rounded-md px-2 py-1 bg-background"
            value={match.status}
            onChange={(e) => {
              const newStatus = e.target.value;
              if (!isValidTransition(match.status, newStatus)) {
                toast.error(`Transición no permitida: ${match.status} → ${newStatus}`);
                return;
              }
              handleStatusChange(match, newStatus);
            }}
            title="Cambiar estado del partido"
          >
            {selectableStatuses.map(s => (
              <option key={s} value={s}>
                {STATUS_LABELS[s]}{s !== match.status ? ` → ${STATUS_LABELS[s]}` : ''}
              </option>
            ))}
          </select>

          {(match.status === 'finished' || match.status === 'closed' || match.status === 'live') && (
            <Button
              size="sm"
              variant="ghost"
              className="h-7 text-xs gap-1 text-amber-600 hover:text-amber-700"
              onClick={handleReopen}
              title="Reabrir partido (limpia resultado)"
            >
              <RotateCcw className="w-3 h-3" />
              Reabrir
            </Button>
          )}

          {/* Botones de Editar / Eliminar partido */}
          {editMatch && <EditMatchDialog match={match} onSave={editMatch} />}
          {deleteMatch && <DeleteMatchDialog match={match} onDelete={deleteMatch} />}

          <div className="flex items-center gap-1.5 ml-auto">
            {(canPublishResult(match) || pendingConfirm) ? (
              <>
                <Input
                  name={`result_${match.id}_t1`}
                  type="number"
                  min="0"
                  className="w-12 h-8 text-center text-sm [appearance:textfield] [&::-webkit-inner-spin-button]:appearance-none [&::-webkit-outer-spin-button]:appearance-none"
                  placeholder="0"
                  value={results.form[match.id]?.team1 ?? (match.result_team1 ?? '')}
                  onChange={(e) => setResults(prev => ({
                    ...prev,
                    form: { ...prev.form, [match.id]: { ...prev.form[match.id], team1: e.target.value } }
                  }))}
                />
                <span className="text-muted-foreground text-sm">-</span>
                <Input
                  name={`result_${match.id}_t2`}
                  type="number"
                  min="0"
                  className="w-12 h-8 text-center text-sm [appearance:textfield] [&::-webkit-inner-spin-button]:appearance-none [&::-webkit-outer-spin-button]:appearance-none"
                  placeholder="0"
                  value={results.form[match.id]?.team2 ?? (match.result_team2 ?? '')}
                  onChange={(e) => setResults(prev => ({
                    ...prev,
                    form: { ...prev.form, [match.id]: { ...prev.form[match.id], team2: e.target.value } }
                  }))}
                />
                {pendingConfirm ? (
                  (() => {
                    const formEntry = results.form[match.id] || {};
                    const resultMethod = formEntry.resultMethod ?? null;
                    // FIX (bug v2-79): método obligatorio al publicar resultado.
                    // Sin result_method en la BD, el breakdown muestra 'Cómo gana ❌ 0'
                    // aunque el pick sea correcto.
                    //
                    // FIX (bug v2-post-28): método solo se exige en partidos v2
                    // (>= 28 jun 2026). En partidos legacy v1 el admin no tiene
                    // por qué elegir cómo terminó — el modelo anterior ya cubre
                    // el resultado con solo marcador + ganador.
                    const methodMissing = isV2 && resultMethod == null;
                    const penaltyMissing = isV2 && resultMethod === 'pen' && (!formEntry.penaltyTeam1 || !formEntry.penaltyTeam2);
                    const teamMissing = !formEntry.team1 || !formEntry.team2;
                    const disabled = teamMissing || methodMissing || penaltyMissing;
                    const disabledReason = teamMissing
                      ? 'Completa el marcador de los 90 min'
                      : methodMissing
                        ? 'Elegí cómo terminó (90 min / T. extra / Penales)'
                        : penaltyMissing
                          ? 'Completa el marcador de penales'
                          : '';
                    return (
                      <Button
                        size="sm"
                        variant="default"
                        onClick={() => handlePublishResult(match, true)}
                        disabled={disabled}
                        className="h-8 text-xs bg-emerald-600 hover:bg-emerald-700 text-white"
                        title={disabled
                          ? disabledReason
                          : 'Finaliza el partido, evalúa pronósticos y notifica a los usuarios'
                        }
                      >
                        <Save className="w-3 h-3 mr-1" />
                        Publicar resultado
                      </Button>
                    );
                  })()
                ) : (
                  <Button size="sm" variant={match.status === 'finished' ? 'outline' : 'secondary'} onClick={() => handlePublishResult(match)} className="h-8 text-xs">
                    <Save className="w-3 h-3 mr-1" />
                    Actualizar
                  </Button>
                )}
              </>
            ) : (
              <span className="text-xs text-muted-foreground/60 italic">
                {match.status === 'closed'
                  ? 'Partido cerrado sin resultado'
                  : 'Cambia a "En Vivo" para actualizar marcador'
                }
              </span>
            )}
          </div>

          {/* Selector de método + marcador de penales (Task 5 · betting-3ways).
              Solo visible cuando el partido puede recibir resultado (live/finished
              o por confirmar). Se renderiza en su propia línea debajo del marcador
              para no romper el layout horizontal de la fila.
              FIX (bug v2-post-28): partidos legacy v1 (pre 28 jun 2026) NO
              muestran este selector — el modelo v1 no usa result_method. */}
          {(canPublishResult(match) || pendingConfirm) && isV2 && (
            <div className="flex flex-wrap items-center gap-2 w-full mt-1">
              <Label className="text-xs text-muted-foreground">Cómo terminó:</Label>
              <Select
                value={results.form[match.id]?.resultMethod ?? ''}
                onValueChange={(v) => setResults(prev => ({
                  ...prev,
                  form: {
                    ...prev.form,
                    [match.id]: { ...prev.form[match.id], resultMethod: v || null },
                  }
                }))}
              >
                <SelectTrigger className="h-8 text-xs w-[160px]">
                  {/* FIX (bug v2-79): placeholder más explícito para que el
                      admin entienda que tiene que elegir. Antes decía 'Auto'
                      y confundía — parecía que el sistema lo resolvía solo. */}
                  <SelectValue placeholder="Elegí método…" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="90">90 min</SelectItem>
                  <SelectItem value="et">Tiempo extra</SelectItem>
                  <SelectItem value="pen">Penales</SelectItem>
                </SelectContent>
              </Select>
              {/* FIX (bug v2-79): eliminamos el badge 'Auto →' que sugería
                  que el sistema resolvía el método solo. El método es
                  obligatorio al publicar — el admin tiene que elegirlo. */}
              {results.form[match.id]?.resultMethod == null && liveResult?.method && (
                <span className="text-[10px] text-amber-700 dark:text-amber-400 italic font-medium">
                  Sugerido: {liveResult.method === '90' ? '90 min' : liveResult.method === 'et' ? 'Tiempo extra' : 'Penales'} (clic para elegir)
                </span>
              )}
            </div>
          )}

          {/* Inputs de penales — solo aparecen si el admin eligió (o el form
              ya tiene) método = 'pen'. Y el partido es v2 (post-28 jun). */}
          {(canPublishResult(match) || pendingConfirm) && isV2 && results.form[match.id]?.resultMethod === 'pen' && (
            <div className="flex flex-wrap items-center gap-2 w-full mt-1">
              <Label className="text-xs text-muted-foreground">Penales:</Label>
              <Input
                name={`result_${match.id}_pt1`}
                type="number"
                min="0"
                className="w-14 h-8 text-center text-sm [appearance:textfield] [&::-webkit-inner-spin-button]:appearance-none [&::-webkit-outer-spin-button]:appearance-none"
                placeholder="0"
                value={results.form[match.id]?.penaltyTeam1 ?? ''}
                onChange={(e) => setResults(prev => ({
                  ...prev,
                  form: {
                    ...prev.form,
                    [match.id]: { ...prev.form[match.id], penaltyTeam1: e.target.value },
                  }
                }))}
              />
              <span className="text-muted-foreground text-sm">-</span>
              <Input
                name={`result_${match.id}_pt2`}
                type="number"
                min="0"
                className="w-14 h-8 text-center text-sm [appearance:textfield] [&::-webkit-inner-spin-button]:appearance-none [&::-webkit-outer-spin-button]:appearance-none"
                placeholder="0"
                value={results.form[match.id]?.penaltyTeam2 ?? ''}
                onChange={(e) => setResults(prev => ({
                  ...prev,
                  form: {
                    ...prev.form,
                    [match.id]: { ...prev.form[match.id], penaltyTeam2: e.target.value },
                  }
                }))}
              />
              {(!results.form[match.id]?.penaltyTeam1 || !results.form[match.id]?.penaltyTeam2) && (
                <span className="text-[10px] text-amber-600 dark:text-amber-400">
                  ⚠ Completa el marcador de penales antes de publicar.
                </span>
              )}
            </div>
          )}

          {hasLockedMatches && isMatchLocked(match) && (
            <Badge variant="outline" className="text-[10px] border-amber-400 text-amber-600 dark:text-amber-400 ml-auto">🔒 Bloqueado</Badge>
          )}
          {match.fixture_id && !isMatchLocked(match) && (
            <span className="text-[10px] text-muted-foreground/50 ml-auto">ID: {match.fixture_id}</span>
          )}
        </div>
      </CardContent>
    </Card>
  );
}

// ─── Diálogo de edición: fecha, hora, fase/grupo ───
function EditMatchDialog({ match, onSave }) {
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState({
    match_date: match.match_date || '',
    match_time: match.match_time || '',
    group_stage: match.group_stage || '',
  });

  const handleOpenChange = (o) => {
    setOpen(o);
    if (o) {
      setForm({
        match_date: match.match_date || '',
        match_time: match.match_time || '',
        group_stage: match.group_stage || '',
      });
    }
  };

  const handleSave = () => {
    if (!form.match_date || !form.match_time) {
      toast.error('Fecha y hora son obligatorias');
      return;
    }
    // No permitir editar partidos live/finished con predicciones scored
    if ((match.status === 'live' || match.status === 'finished') && match._hasScoredPredictions) {
      toast.error('No se puede editar un partido finalizado con predicciones evaluadas');
      return;
    }
    onSave.mutate(
      { id: match.id, data: form },
      {
        onSuccess: () => setOpen(false),
      }
    );
  };

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogTrigger asChild>
        <Button size="sm" variant="ghost" className="h-7 text-xs gap-1" title="Editar fecha/hora/fase">
          <Pencil className="w-3 h-3" />
          Editar
        </Button>
      </DialogTrigger>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>Editar partido</DialogTitle>
          <DialogDescription>
            Modifica la fecha, hora o fase. Los equipos y resultado no se pueden cambiar.
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-3">
          <div className="bg-muted/30 rounded-md p-2 text-sm font-medium">
            {match.team1} vs {match.team2}
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <Label htmlFor={`edit-date-${match.id}`}>Fecha</Label>
              <Input
                id={`edit-date-${match.id}`}
                type="date"
                value={form.match_date}
                onChange={(e) => setForm({ ...form, match_date: e.target.value })}
              />
            </div>
            <div>
              <Label htmlFor={`edit-time-${match.id}`}>Hora</Label>
              <Input
                id={`edit-time-${match.id}`}
                type="time"
                value={form.match_time}
                onChange={(e) => setForm({ ...form, match_time: e.target.value })}
              />
            </div>
          </div>
          <div>
            <Label htmlFor={`edit-group-${match.id}`}>Fase / Grupo</Label>
            <Input
              id={`edit-group-${match.id}`}
              value={form.group_stage}
              onChange={(e) => setForm({ ...form, group_stage: e.target.value })}
              placeholder="Ej: Grupo A, Octavos, Final"
            />
          </div>
        </div>
        <DialogFooter>
          <DialogClose asChild>
            <Button variant="ghost">Cancelar</Button>
          </DialogClose>
          <Button onClick={handleSave} disabled={onSave.isPending}>
            {onSave.isPending ? 'Guardando...' : 'Guardar cambios'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// ─── Diálogo de eliminación con confirmación ───
function DeleteMatchDialog({ match, onDelete }) {
  const [open, setOpen] = useState(false);
  const [confirmText, setConfirmText] = useState('');

  const handleDelete = () => {
    if (confirmText !== match.team1) {
      toast.error(`Escribe "${match.team1}" para confirmar`);
      return;
    }
    onDelete.mutate(match.id, {
      onSuccess: () => setOpen(false),
    });
  };

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button size="sm" variant="ghost" className="h-7 text-xs gap-1 text-destructive hover:text-destructive" title="Eliminar partido">
          <Trash2 className="w-3 h-3" />
        </Button>
      </DialogTrigger>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle className="text-destructive">Eliminar partido</DialogTitle>
          <DialogDescription>
            Esta acción no se puede deshacer. Las predicciones existentes se desvincularán (no se borran del historial del usuario).
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-3">
          <div className="bg-muted/30 rounded-md p-3 text-sm">
            <p className="font-bold">{match.team1} vs {match.team2}</p>
            <p className="text-muted-foreground text-xs">
              {match.match_date} {match.match_time && `· ${formatTime12h(match.match_time)}`}
            </p>
            {match._predictionCount > 0 && (
              <p className="text-amber-600 dark:text-amber-400 text-xs mt-2">
                ⚠️ Este partido tiene {match._predictionCount} pronóstico{match._predictionCount > 1 ? 's' : ''} que se desvincularán.
              </p>
            )}
          </div>
          <div>
            <Label htmlFor={`delete-confirm-${match.id}`}>
              Escribe <span className="font-bold">{match.team1}</span> para confirmar:
            </Label>
            <Input
              id={`delete-confirm-${match.id}`}
              value={confirmText}
              onChange={(e) => setConfirmText(e.target.value)}
              placeholder={match.team1}
              className="mt-1"
            />
          </div>
        </div>
        <DialogFooter>
          <DialogClose asChild>
            <Button variant="ghost">Cancelar</Button>
          </DialogClose>
          <Button
            variant="destructive"
            onClick={handleDelete}
            disabled={onDelete.isPending || confirmText !== match.team1}
          >
            {onDelete.isPending ? 'Eliminando...' : 'Eliminar partido'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
