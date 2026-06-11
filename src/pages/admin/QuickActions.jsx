import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogTrigger } from '@/components/ui/dialog';
import { Database, Layers, RefreshCw, Plus } from 'lucide-react';
import { toast } from 'sonner';
import { TEAM_FLAGS } from '@/lib/teamFlags';

const ENGLISH_ALIASES = new Set([
  'Mexico', 'South Korea', 'Korea Republic', 'Czech Republic', 'Czechia',
  'Bosnia and Herzegovina', 'USA', 'Netherlands', 'Ivory Coast', "Côte d'Ivoire",
  'Saudi Arabia', 'New Zealand', 'Cape Verde', 'DR Congo', 'DRC',
]);

const SORTED_TEAMS = Object.entries(TEAM_FLAGS)
  .filter(([name]) => !ENGLISH_ALIASES.has(name))
  .sort((a, b) => a[0].localeCompare(b[0], 'es'))
  .map(([name, info]) => ({ name, ...info }));

export default function QuickActions({ onSeed, seeding, hasLocked, onDedupe, deduping, matchCount, onClear, clearing, onCreateMatch, creating }) {
  const [dialogOpen, setDialogOpen] = useState(false);
  const [form, setForm] = useState({ team1: '', team2: '', match_date: '', match_time: '', group_stage: '' });

  const handleCreate = () => {
    if (!form.team1 || !form.team2) {
      toast.error('Selecciona ambos equipos.');
      return;
    }
    if (form.team1 === form.team2) {
      toast.error('Los equipos deben ser diferentes.');
      return;
    }
    if (form.match_date && !isFutureDate(form.match_date, form.match_time)) {
      toast.error('No puedes crear partidos en el pasado. La fecha/hora debe ser futura.');
      return;
    }
    onCreateMatch(form);
    setForm({ team1: '', team2: '', match_date: '', match_time: '', group_stage: '' });
    setDialogOpen(false);
  };

  return (
    <div className="flex flex-wrap gap-2">
      <Button variant="outline" size="sm" onClick={onSeed} disabled={seeding || hasLocked} className="gap-2">
        <Database className="w-4 h-4" /> {seeding ? 'Sembrando...' : 'Seedear 104 partidos'}
      </Button>
      <Button variant="secondary" size="sm" onClick={onDedupe} disabled={deduping || matchCount === 0} className="gap-2">
        <Layers className="w-4 h-4" /> {deduping ? 'Deduplicando...' : 'Deduplicar partidos'}
      </Button>
      <Button variant="destructive" size="sm" onClick={onClear} disabled={clearing || matchCount === 0} className="gap-2">
        <RefreshCw className={`w-4 h-4 ${clearing ? 'animate-spin' : ''}`} /> {clearing ? 'Reiniciando...' : 'Limpiar todos'}
      </Button>
      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogTrigger asChild>
          <Button className="gap-2"><Plus className="w-4 h-4" /> Crear Partido Manual</Button>
        </DialogTrigger>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Nuevo Partido</DialogTitle>
            <DialogDescription className="sr-only">Crear un nuevo partido manual seleccionando los equipos, fecha, hora y fase.</DialogDescription>
          </DialogHeader>
          <div className="space-y-3">
            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label htmlFor="new-team1">Equipo 1</Label>
                <Select value={form.team1} onValueChange={v => setForm({...form, team1: v})}>
                  <SelectTrigger id="new-team1"><SelectValue placeholder="Selecciona equipo" /></SelectTrigger>
                  <SelectContent>
                    {SORTED_TEAMS.map(t => (
                      <SelectItem key={t.name} value={t.name} disabled={t.name === form.team2}>
                        <span className="mr-2">{t.flag}</span>{t.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label htmlFor="new-team2">Equipo 2</Label>
                <Select value={form.team2} onValueChange={v => setForm({...form, team2: v})}>
                  <SelectTrigger id="new-team2"><SelectValue placeholder="Selecciona equipo" /></SelectTrigger>
                  <SelectContent>
                    {SORTED_TEAMS.map(t => (
                      <SelectItem key={t.name} value={t.name} disabled={t.name === form.team1}>
                        <span className="mr-2">{t.flag}</span>{t.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div><Label htmlFor="new-date">Fecha</Label><Input id="new-date" type="date" value={form.match_date} onChange={e => setForm({...form, match_date: e.target.value})} /></div>
              <div><Label htmlFor="new-time">Hora</Label><Input id="new-time" type="time" value={form.match_time} onChange={e => setForm({...form, match_time: e.target.value})} /></div>
            </div>
            <div><Label htmlFor="new-group">Fase / Grupo</Label><Input id="new-group" placeholder="Ej: Grupo A, Octavos" value={form.group_stage} onChange={e => setForm({...form, group_stage: e.target.value})} /></div>
            <Button className="w-full" onClick={handleCreate} disabled={creating}>Crear Partido</Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}

function isFutureDate(dateStr, timeStr) {
  const ms = new Date(`${dateStr}T${timeStr || '23:59'}:00`).getTime();
  return !isNaN(ms) && ms >= Date.now();
}
