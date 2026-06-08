import { Badge } from '@/components/ui/badge';
import { Clock, Sparkles, Gift, Users } from 'lucide-react';
import { format } from 'date-fns';
import { es } from 'date-fns/locale/es';

const statusLabels = {
  pending: 'Pendiente',
  approved: 'Aprobado',
  delivered: 'Entregado',
};

const statusColors = {
  pending: 'bg-secondary text-secondary-foreground',
  approved: 'bg-primary text-primary-foreground',
  delivered: 'bg-accent text-accent-foreground',
};

export function PredictionsHistory({ predictions, matchMap }) {
  if (predictions.length === 0) {
    return <p className="text-sm text-muted-foreground py-2 text-center">Sin pronósticos</p>;
  }
  return predictions.map(pred => {
    const match = matchMap[pred.match_id];
    return (
      <div key={pred.id} className="flex items-center justify-between p-2.5 rounded-lg bg-muted/30 text-sm">
        <div className="min-w-0 flex-1">
          <p className="text-xs font-medium truncate">{match ? `${match.team1} vs ${match.team2}` : 'Partido desconocido'}</p>
          <p className="text-xs text-muted-foreground">
            Pronóstico: <strong>{pred.pred_team1} - {pred.pred_team2}</strong>
            {match?.status === 'finished' && <> · Real: {match.result_team1} - {match.result_team2}</>}
          </p>
        </div>
        <div className="shrink-0 ml-2">
          {pred.scored ? (
            pred.is_correct ? (
              <Badge className="bg-emerald-100 text-emerald-700 dark:bg-emerald-900/40 dark:text-emerald-300 border-0 text-xs">+100</Badge>
            ) : (
              <Badge variant="outline" className="text-xs text-muted-foreground">0</Badge>
            )
          ) : (
            <Clock className="w-3.5 h-3.5 text-muted-foreground/40" />
          )}
        </div>
      </div>
    );
  });
}

export function BonusesHistory({ bonuses }) {
  if (bonuses.length === 0) {
    return <p className="text-sm text-muted-foreground py-2 text-center">Sin bonos</p>;
  }
  return bonuses.map(b => (
    <div key={b.id} className="flex items-center justify-between p-2.5 rounded-lg bg-muted/30 text-sm">
      <div>
        <p className="text-xs font-medium">{b.reason || 'Bono'}</p>
        <p className="text-xs text-muted-foreground">
          {b.type === 'welcome' ? 'Bienvenida' : 'Otorgado por admin'}
          {b.created_date && ` · ${format(new Date(b.created_date), 'd MMM yyyy', { locale: es })}`}
        </p>
      </div>
      <Badge className="bg-emerald-100 text-emerald-700 dark:bg-emerald-900/40 dark:text-emerald-300 border-0 text-xs font-bold">+{b.points}</Badge>
    </div>
  ));
}

export function RedemptionsHistory({ redemptions, totalSpent }) {
  if (redemptions.length === 0) {
    return <p className="text-sm text-muted-foreground py-2 text-center">Sin canjes</p>;
  }
  return (
    <>
      {redemptions.map(r => (
        <div key={r.id} className="flex items-center justify-between p-2.5 rounded-lg bg-muted/30 text-sm">
          <div>
            <p className="text-xs font-medium">{r.prize_name}</p>
            <p className="text-xs text-muted-foreground">
              {r.created_date && format(new Date(r.created_date), 'd MMM yyyy', { locale: es })}
            </p>
          </div>
          <div className="flex items-center gap-2">
            <span className="text-xs font-bold text-muted-foreground">-{r.points_spent} pts</span>
            <Badge className={`${statusColors[r.status]} border-0 text-[10px]`}>{statusLabels[r.status]}</Badge>
          </div>
        </div>
      ))}
      {totalSpent > 0 && (
        <p className="text-xs text-muted-foreground text-right pt-1">Total gastado: <strong className="text-foreground">{totalSpent} pts</strong></p>
      )}
    </>
  );
}

export function CommissionsHistory({ commissions, matchMap, allUsers }) {
  if (commissions.length === 0) {
    return <p className="text-sm text-muted-foreground py-2 text-center">Sin comisiones</p>;
  }
  return (
    <>
      {commissions.map(c => {
        const fromUser = allUsers.find(u => u.email === c.from_email);
        return (
          <div key={c.id} className="flex items-center justify-between p-2.5 rounded-lg bg-muted/30 text-sm">
            <div>
              <p className="text-xs font-medium">{fromUser?.full_name || c.from_email}</p>
              <p className="text-xs text-muted-foreground">
                {c.match_id && matchMap[c.match_id]
                  ? `Acierto: ${matchMap[c.match_id].team1} vs ${matchMap[c.match_id].team2}`
                  : 'Registro de referido'}
                {c.created_date && ` · ${format(new Date(c.created_date), 'd MMM yyyy', { locale: es })}`}
              </p>
            </div>
            <Badge className="bg-purple-100 text-purple-700 dark:bg-purple-900/40 dark:text-purple-300 border-0 text-xs font-bold">+{c.points_earned}</Badge>
          </div>
        );
      })}
    </>
  );
}
