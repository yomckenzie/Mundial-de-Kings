import { m } from 'framer-motion';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import { Target, CheckCircle2, X, Clock } from 'lucide-react';

export default function PredictionsTab({ predictions, matchMap, isLoading }) {
  if (isLoading) {
    return (
      <div className="space-y-3">
        {[1, 2, 3].map(i => <Skeleton key={i} className="h-16 w-full rounded-lg" />)}
      </div>
    );
  }

  if (predictions.length === 0) {
    return (
      <Card>
        <CardContent className="p-8 text-center text-muted-foreground">
          <Target className="w-10 h-10 mx-auto mb-3 opacity-30" />
          <p>Aún no has hecho pronósticos.</p>
          <p className="text-xs mt-1">Ve a la sección Partidos para comenzar.</p>
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="space-y-2">
      {predictions.map((pred, i) => {
        const match = matchMap[pred.match_id];
        if (!match) return null;
        return (
          <m.div
            key={pred.id}
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: i * 0.03, duration: 0.2 }}
          >
            <Card className="card-hover">
              <CardContent className="p-3 md:p-4 flex items-center justify-between gap-3">
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 mb-0.5">
                    <p className="font-semibold text-sm truncate">{match.team1} vs {match.team2}</p>
                    {pred.scored && (
                      <Badge className={`shrink-0 text-[10px] px-1.5 py-0 ${pred.is_correct ? 'bg-emerald-100 text-emerald-700 dark:bg-emerald-900/40 dark:text-emerald-300' : 'bg-muted text-muted-foreground'}`}>
                        {pred.is_correct ? '+100' : '0'}
                      </Badge>
                    )}
                  </div>
                  <div className="flex items-center gap-2 text-xs text-muted-foreground">
                    <span>Tu pronóstico: <strong>{pred.pred_team1} - {pred.pred_team2}</strong></span>
                    {match.status === 'finished' && (
                      <span>| Real: {match.result_team1} - {match.result_team2}</span>
                    )}
                  </div>
                </div>
                <div className="shrink-0 text-right">
                  {pred.scored ? (
                    pred.is_correct ? (
                      <CheckCircle2 className="w-5 h-5 text-foreground" />
                    ) : (
                      <X className="w-5 h-5 text-destructive/60" />
                    )
                  ) : (
                    <Clock className="w-5 h-5 text-muted-foreground/40" />
                  )}
                </div>
              </CardContent>
            </Card>
          </m.div>
        );
      })}
    </div>
  );
}
