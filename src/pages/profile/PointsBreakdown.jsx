import { Card, CardContent } from '@/components/ui/card';
import { Award, Target, Star, UserPlus, Gift, TrendingUp, Trophy, Info } from 'lucide-react';

export default function PointsBreakdown({
  predictionPoints, bonusPoints, referralPoints, totalSpent, totalPoints, availablePoints,
  accuracy, correctPreds, scoredPreds,
  v1Points = 0, v2Points = 0,
  v1Aciertos = 0, v1Total = 0,
  v2WinnerAciertos = 0, v2MethodAciertos = 0, v2ScoreAciertos = 0, v2Total = 0,
}) {
  return (
    <Card className="overflow-hidden gradient-border">
      <CardContent className="p-4 md:p-5 space-y-3">
        <div className="flex items-center gap-2 mb-1">
          <Award className="w-5 h-5 text-foreground" />
          <h2 className="font-semibold">Desglose de Puntos</h2>
        </div>

        <div className="flex items-center justify-between p-3 bg-muted/50 rounded-lg">
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 rounded-lg bg-primary/10 flex items-center justify-center">
              <Target className="w-4 h-4 text-primary" />
            </div>
            <div>
              <p className="text-sm font-medium">Por pronósticos</p>
              <p className="text-xs text-muted-foreground">Los únicos que cuentan para el Ranking</p>
            </div>
          </div>
          <span className="font-bold text-lg">{predictionPoints} pts</span>
        </div>

        {/* Sub-desglose del modelo: v1 (legacy pre-28 jun) vs v2 (≥ 28 jun) */}
        {(v1Total > 0 || v2Total > 0) && (
          <div className="ml-3 sm:ml-4 pl-3 sm:pl-4 border-l-2 border-border/50 space-y-1.5 text-xs">
            {v1Total > 0 && (
              <div className="flex items-center justify-between py-1 px-2 rounded bg-muted/30">
                <div className="flex items-center gap-1.5">
                  <span className="font-medium text-muted-foreground">v1</span>
                  <span className="text-muted-foreground/80">(pre-28 jun, marcador exacto 100 pts)</span>
                </div>
                <span className="font-semibold tabular-nums">{v1Points} pts · {v1Aciertos}/{v1Total}</span>
              </div>
            )}
            {v2Total > 0 && (
              <div className="flex items-center justify-between py-1 px-2 rounded bg-muted/30">
                <div className="flex items-center gap-1.5">
                  <span className="font-medium text-foreground">v2</span>
                  <span className="text-muted-foreground/80">(≥ 28 jun, 3 picks · gate del ganador)</span>
                </div>
                <span className="font-semibold tabular-nums">{v2Points} pts</span>
              </div>
            )}
            {v2Total > 0 && (
              <div className="grid grid-cols-3 gap-1 mt-1">
                <div className="flex flex-col items-center py-1 px-1 rounded bg-primary/5 text-center">
                  <span className="text-[10px] text-muted-foreground leading-tight">Ganador</span>
                  <span className="font-semibold tabular-nums text-foreground">{v2WinnerAciertos}/{v2Total}</span>
                </div>
                <div className="flex flex-col items-center py-1 px-1 rounded bg-primary/5 text-center">
                  <span className="text-[10px] text-muted-foreground leading-tight">Método</span>
                  <span className="font-semibold tabular-nums text-foreground">{v2MethodAciertos}/{v2Total}</span>
                </div>
                <div className="flex flex-col items-center py-1 px-1 rounded bg-primary/5 text-center">
                  <span className="text-[10px] text-muted-foreground leading-tight">Marcador</span>
                  <span className="font-semibold tabular-nums text-foreground">{v2ScoreAciertos}/{v2Total}</span>
                </div>
              </div>
            )}
          </div>
        )}

        <div className="flex items-center justify-between p-3 bg-muted/50 rounded-lg">
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 rounded-lg bg-yellow-500/10 flex items-center justify-center">
              <Star className="w-4 h-4 text-foreground" />
            </div>
            <div>
              <p className="text-sm font-medium">Puntos extra</p>
              <p className="text-xs text-muted-foreground">Bienvenida + bonos</p>
            </div>
          </div>
          <span className="font-bold text-lg">{bonusPoints} pts</span>
        </div>

        <div className="flex items-center justify-between p-3 bg-emerald-500/10 rounded-lg">
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 rounded-lg bg-emerald-500/10 flex items-center justify-center">
              <UserPlus className="w-4 h-4 text-emerald-600 dark:text-emerald-400" />
            </div>
            <div>
              <p className="text-sm font-medium">Por referidos</p>
              <p className="text-xs text-muted-foreground">Comisiones por tu red</p>
            </div>
          </div>
          <span className="font-bold text-lg">{referralPoints} pts</span>
        </div>

        <div className="flex items-center justify-between p-3 bg-red-500/10 rounded-lg">
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 rounded-lg bg-red-500/10 flex items-center justify-center">
              <Gift className="w-4 h-4 text-red-500/70" />
            </div>
            <div>
              <p className="text-sm font-medium">Usados en canjes</p>
              <p className="text-xs text-muted-foreground">Premios canjeados</p>
            </div>
          </div>
          <span className="font-bold text-lg">{totalSpent} pts</span>
        </div>

        <div className="flex items-center justify-between p-3 bg-muted rounded-lg border border-border">
          <div>
            <span className="font-bold">Total ganado</span>
            <p className="text-xs text-muted-foreground">Pronósticos + bonos + referidos · para canjear premios</p>
          </div>
          <span className="font-black text-xl">{totalPoints} pts</span>
        </div>

        <div className="flex items-center justify-between p-3 bg-primary/5 rounded-lg border border-primary/20">
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 rounded-lg bg-primary/10 flex items-center justify-center">
              <Trophy className="w-4 h-4 text-primary" />
            </div>
            <div>
              <p className="text-sm font-semibold">Disponibles para canjear</p>
              <p className="text-xs text-muted-foreground">Total − Usados</p>
            </div>
          </div>
          <span className="font-black text-xl text-primary">{availablePoints} pts</span>
        </div>

        {accuracy > 0 && (
          <div className="flex items-center gap-2 text-sm text-muted-foreground pt-1">
            <TrendingUp className="w-4 h-4 text-foreground" />
            Precisión: <span className="font-bold text-foreground">{accuracy}%</span>
            ({correctPreds.length} aciertos de {scoredPreds.length} evaluados)
          </div>
        )}
      </CardContent>
    </Card>
  );
}
