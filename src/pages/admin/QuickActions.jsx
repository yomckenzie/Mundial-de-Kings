import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { Database, Layers, RefreshCw, Plus } from 'lucide-react';
import { toast } from 'sonner';

export default function QuickActions({ onSeed, seeding, hasLocked, onDedupe, deduping, matchCount, onClear, clearing, onCreateMatch, creating }) {
  const [dialogOpen, setDialogOpen] = useState(false);
  const [form, setForm] = useState({ team1: '', team2: '', match_date: '', match_time: '', group_stage: '' });

  const handleCreate = () => {
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
          </DialogHeader>
          <div className="space-y-3">
            <div className="grid grid-cols-2 gap-3">
              <div><Label htmlFor="new-team1">Equipo 1</Label><Input id="new-team1" value={form.team1} onChange={e => setForm({...form, team1: e.target.value})} /></div>
              <div><Label htmlFor="new-team2">Equipo 2</Label><Input id="new-team2" value={form.team2} onChange={e => setForm({...form, team2: e.target.value})} /></div>
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
