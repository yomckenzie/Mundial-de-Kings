import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Zap, Save } from 'lucide-react';

function canPublishResult(match) {
  return match.status === 'live' || match.status === 'finished';
}

export default function BatchPublishCard({ matches, results, setResults, onPublish }) {
  const pendingPublishCount = Object.entries(results.bulk)
    .filter(([_, r]) => r.team1 !== '' && r.team1 !== undefined && r.team2 !== '' && r.team2 !== undefined)
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
          Ingresa los marcadores de los partidos en vivo para actualizarlos
        </p>
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2 max-h-48 overflow-y-auto">
          {filteredMatches.map(match => (
            <div key={match.id} className="flex items-center gap-1.5 text-xs bg-background rounded-md p-1.5 border">
              <span className="truncate flex-1 text-right font-medium">{match.team1}</span>
              <Input
                type="number"
                min="0"
                className="w-10 h-7 text-center text-xs px-1"
                placeholder="0"
                value={results.bulk[match.id]?.team1 ?? ''}
                onChange={(e) => setResults(prev => ({
                  ...prev,
                  bulk: { ...prev.bulk, [match.id]: { ...prev.bulk[match.id], team1: e.target.value } }
                }))}
              />
              <span className="text-muted-foreground">-</span>
              <Input
                type="number"
                min="0"
                className="w-10 h-7 text-center text-xs px-1"
                placeholder="0"
                value={results.bulk[match.id]?.team2 ?? ''}
                onChange={(e) => setResults(prev => ({
                  ...prev,
                  bulk: { ...prev.bulk, [match.id]: { ...prev.bulk[match.id], team2: e.target.value } }
                }))}
              />
              <span className="truncate flex-1 font-medium">{match.team2}</span>
            </div>
          ))}
        </div>
      </CardContent>
    </Card>
  );
}
