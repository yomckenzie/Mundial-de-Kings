import { Card, CardContent } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Clock, Save } from 'lucide-react';

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

function getElapsed(match, liveNow) {
  if (match.status === 'live' && match.live_started_at) {
    const startedAt = new Date(match.live_started_at).getTime();
    if (isNaN(startedAt)) return match.elapsed;
    return Math.floor((liveNow - startedAt) / 60000);
  }
  return match.elapsed;
}

export default function MatchCardItem({ match, hasLockedMatches, liveNow, results, setResults, handleStatusChange, handlePublishResult }) {
  return (
    <Card className={`mb-2 ${match.status === 'live' ? 'ring-2 ring-red-500/50' : ''}`}>
      <CardContent className="p-4 space-y-3">
        <div className="flex items-center justify-between">
          <div className="text-sm text-muted-foreground flex items-center gap-2">
            <Clock className="w-4 h-4" />{match.match_time}
            {match.group_stage && <Badge variant="outline" className="text-[10px] ml-1">{match.group_stage}</Badge>}
          </div>
          <Badge className={STATUS_COLORS[match.status] || 'bg-muted'}>
            {STATUS_LABELS[match.status] || match.status}
            {match.status === 'live' && getElapsed(match, liveNow) != null && ` ${getElapsed(match, liveNow)}'`}
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
          <select
            name={`status_${match.id}`}
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

          {match.status === 'live' && (
            <div className="flex items-center gap-1 text-xs font-mono bg-red-50 dark:bg-red-950/20 px-2 py-1 rounded-md border border-red-200 dark:border-red-900">
              <span className="font-semibold text-red-600">{getElapsed(match, liveNow) ?? '0'}'</span>
            </div>
          )}

          <div className="flex items-center gap-1.5 ml-auto">
            {canPublishResult(match) ? (
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
                <Button size="sm" variant={match.status === 'finished' ? 'outline' : 'secondary'} onClick={() => handlePublishResult(match)} className="h-8 text-xs">
                  <Save className="w-3 h-3 mr-1" />
                  Actualizar
                </Button>
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
