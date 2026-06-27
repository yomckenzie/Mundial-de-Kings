import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Zap, Save } from 'lucide-react';

function canPublishResult(match) {
  return match.status === 'live' || match.status === 'finished';
}

export default function BatchPublishCard({ matches, results, setResults, onPublish, liveResults }) {
  // Una fila se considera "lista para publicar" si tiene ambos marcadores
  // Y (si el método es 'pen') los dos penales completos. Si el método es
  // null, dejamos que useMatchHandlers resuelva desde SportScore.
  const pendingPublishCount = Object.entries(results.bulk)
    .filter(([_, r]) => {
      if (r.team1 === '' || r.team1 === undefined) return false;
      if (r.team2 === '' || r.team2 === undefined) return false;
      if (r.resultMethod === 'pen' && (!r.penaltyTeam1 || !r.penaltyTeam2)) return false;
      return true;
    })
    .length;

  const filteredMatches = [];
  let count = 0;
  for (const match of matches) {
    if (!canPublishResult(match) || match.status === 'finished') continue;
    if (count >= 30) break;
    filteredMatches.push(match);
    count++;
  }

  if (filteredMatches.length === 0) return null;

  return (
    <Card className="border-2 border-dashed border-primary/30 bg-primary/5">
      <CardContent className="p-4">
        <div className="flex items-center justify-between mb-3">
          <div className="flex items-center gap-2">
            <Zap className="w-5 h-5 text-primary" />
            <span className="font-medium text-sm">Actualización Rápida de Marcadores</span>
          </div>
          {pendingPublishCount > 0 && (
            <Button size="sm" onClick={onPublish} className="gap-2">
              <Save className="w-4 h-4" />
              Actualizar {pendingPublishCount} marcador{pendingPublishCount > 1 ? 'es' : ''}
            </Button>
          )}
        </div>
        <p className="text-xs text-muted-foreground mb-2">
          Ingresa los marcadores de los partidos en vivo para actualizarlos. Si el partido terminó en
          penales, selecciona el método y completa el marcador de penales.
        </p>
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2 max-h-96 overflow-y-auto">
          {filteredMatches.map(match => {
            const live = liveResults?.[match.id];
            const bulkEntry = results.bulk[match.id] || {};
            return (
              <div key={match.id} className="flex flex-col gap-1 text-xs bg-background rounded-md p-1.5 border">
                <div className="flex items-center gap-1.5">
                  <span className="truncate flex-1 text-right font-medium">{match.team1}</span>
                  <Input
                    name={`bulk_${match.id}_t1`}
                    type="number"
                    min="0"
                    className="w-10 h-7 text-center text-xs px-1"
                    placeholder="0"
                    value={bulkEntry.team1 ?? ''}
                    onChange={(e) => setResults(prev => ({
                      ...prev,
                      bulk: { ...prev.bulk, [match.id]: { ...prev.bulk[match.id], team1: e.target.value } }
                    }))}
                  />
                  <span className="text-muted-foreground">-</span>
                  <Input
                    name={`bulk_${match.id}_t2`}
                    type="number"
                    min="0"
                    className="w-10 h-7 text-center text-xs px-1"
                    placeholder="0"
                    value={bulkEntry.team2 ?? ''}
                    onChange={(e) => setResults(prev => ({
                      ...prev,
                      bulk: { ...prev.bulk, [match.id]: { ...prev.bulk[match.id], team2: e.target.value } }
                    }))}
                  />
                  <span className="truncate flex-1 font-medium">{match.team2}</span>
                </div>
                {/* Selector de método + penales (mismo patrón que MatchCardItem,
                    Task 5 · betting-3ways). */}
                <div className="flex items-center gap-1.5 flex-wrap">
                  <Label className="text-[10px] text-muted-foreground">Método:</Label>
                  <Select
                    value={bulkEntry.resultMethod ?? ''}
                    onValueChange={(v) => setResults(prev => ({
                      ...prev,
                      bulk: {
                        ...prev.bulk,
                        [match.id]: { ...prev.bulk[match.id], resultMethod: v || null },
                      }
                    }))}
                  >
                    <SelectTrigger className="h-6 text-[10px] flex-1 min-w-0 px-2">
                      <SelectValue placeholder="Auto" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="90">90 min</SelectItem>
                      <SelectItem value="et">Tiempo extra</SelectItem>
                      <SelectItem value="pen">Penales</SelectItem>
                    </SelectContent>
                  </Select>
                  {bulkEntry.resultMethod == null && live?.method && (
                    <span className="text-[10px] text-muted-foreground italic">
                      Auto: {live.method === '90' ? '90m' : live.method === 'et' ? 'ET' : 'Pen'}
                    </span>
                  )}
                </div>
                {bulkEntry.resultMethod === 'pen' && (
                  <div className="flex items-center gap-1 flex-wrap">
                    <Label className="text-[10px] text-muted-foreground">Pen:</Label>
                    <Input
                      name={`bulk_${match.id}_pt1`}
                      type="number"
                      min="0"
                      className="w-10 h-6 text-center text-xs px-1"
                      placeholder="0"
                      value={bulkEntry.penaltyTeam1 ?? ''}
                      onChange={(e) => setResults(prev => ({
                        ...prev,
                        bulk: {
                          ...prev.bulk,
                          [match.id]: { ...prev.bulk[match.id], penaltyTeam1: e.target.value },
                        }
                      }))}
                    />
                    <span className="text-muted-foreground text-[10px]">-</span>
                    <Input
                      name={`bulk_${match.id}_pt2`}
                      type="number"
                      min="0"
                      className="w-10 h-6 text-center text-xs px-1"
                      placeholder="0"
                      value={bulkEntry.penaltyTeam2 ?? ''}
                      onChange={(e) => setResults(prev => ({
                        ...prev,
                        bulk: {
                          ...prev.bulk,
                          [match.id]: { ...prev.bulk[match.id], penaltyTeam2: e.target.value },
                        }
                      }))}
                    />
                    {(!bulkEntry.penaltyTeam1 || !bulkEntry.penaltyTeam2) && (
                      <span className="text-[10px] text-amber-600 dark:text-amber-400">
                        ⚠ Completar
                      </span>
                    )}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      </CardContent>
    </Card>
  );
}
