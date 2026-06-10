import { Card, CardContent } from '@/components/ui/card';
import { Award, Target, Star, UserPlus, Gift, TrendingUp, Trophy } from 'lucide-react';

export default function PointsBreakdown({ predictionPoints, bonusPoints, referralPoints, totalSpent, totalPoints, availablePoints, accuracy, correctPreds, scoredPreds }) {
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
              <p className="text-xs text-muted-foreground">Usado en el Ranking</p>
            </div>
          </div>
          <span className="font-bold text-lg">{predictionPoints} pts</span>
        </div>

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
            <p className="text-xs text-muted-foreground">Para el ranking</p>
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
