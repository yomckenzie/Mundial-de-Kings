import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Sparkles, UserPlus, Target, Gift, History, Undo2 } from 'lucide-react';

// ─────────────────────────────────────────────────────────────────
// RESUMEN — historial de movimientos de puntos tipo estado de cuenta:
// todo lo que entra (bonos, comisiones por referidos, aciertos de
// pronósticos) y todo lo que sale (canjes de premios), ordenado por
// fecha descendente. Los canjes rechazados se muestran con los puntos
// devueltos (no descuentan).
// ─────────────────────────────────────────────────────────────────

const movementStyles = {
  bonus: { icon: Sparkles, iconClass: 'text-amber-500', bg: 'bg-amber-500/10' },
  commission: { icon: UserPlus, iconClass: 'text-emerald-600 dark:text-emerald-400', bg: 'bg-emerald-500/10' },
  prediction: { icon: Target, iconClass: 'text-primary', bg: 'bg-primary/10' },
  redemption: { icon: Gift, iconClass: 'text-red-500/80', bg: 'bg-red-500/10' },
  refund: { icon: Undo2, iconClass: 'text-muted-foreground', bg: 'bg-muted' },
};

function buildMovements({ bonuses, myCommissions, predictions, redemptions, allUsers, matchMap }) {
  const movements = [];

  // Bonos (bienvenida + otorgados por admin)
  for (const b of bonuses) {
    movements.push({
      id: `bonus-${b.id}`,
      kind: 'bonus',
      date: b.created_date,
      title: b.reason || 'Bono de puntos',
      subtitle: b.type === 'welcome' ? 'Bono de bienvenida' : 'Bono otorgado por admin',
      amount: Number(b.amount ?? b.points) || 0,
    });
  }

  // Comisiones por referidos
  for (const c of myCommissions) {
    const referredUser = allUsers.find(u => u.email === c.from_email);
    const refMatch = matchMap[c.match_id];
    const isRegistration = c.type === 'registration' || !c.match_id;
    const name = referredUser?.full_name || c.from_email;
    movements.push({
      id: `comm-${c.id}`,
      kind: 'commission',
      date: c.created_date,
      title: isRegistration
        ? `${name} se registró con tu código`
        : `${name} acertó un pronóstico${refMatch ? ` (${refMatch.team1} vs ${refMatch.team2})` : ''}`,
      subtitle: isRegistration ? 'Bono por registro de referido' : 'Comisión por acierto de referido',
      amount: Number(c.points_earned) || 0,
    });
  }

  // Aciertos de pronósticos (solo evaluados y correctos)
  for (const p of predictions) {
    if (!p.scored || !p.is_correct) continue;
    const match = matchMap[p.match_id];
    movements.push({
      id: `pred-${p.id}`,
      kind: 'prediction',
      date: p.updated_at || p.created_date,
      title: match ? `Acierto: ${match.team1} vs ${match.team2}` : 'Pronóstico acertado',
      subtitle: 'Puntos de Ranking por acertar',
      amount: Number(p.points_earned) || 100,
    });
  }

  // Canjes de premios (gasto). Los rechazados aparecen como devolución.
  for (const r of redemptions) {
    const rejected = r.status === 'rejected';
    const statusLabel = {
      pending: 'Canje pendiente de aprobación',
      approved: 'Canje aprobado',
      delivered: 'Premio entregado',
      rejected: 'Canje rechazado — puntos devueltos',
    }[r.status] || 'Canje';
    movements.push({
      id: `red-${r.id}`,
      kind: rejected ? 'refund' : 'redemption',
      date: r.created_date,
      title: `Canje: ${r.prize_name}`,
      subtitle: statusLabel,
      amount: -(Number(r.points_spent) || 0),
      refunded: rejected,
    });
  }

  movements.sort((a, b) => new Date(b.date || 0) - new Date(a.date || 0));
  return movements;
}

export default function OverviewTab({ bonuses, myCommissions, allUsers, matchMap, predictions = [], redemptions = [] }) {
  const movements = buildMovements({ bonuses, myCommissions, predictions, redemptions, allUsers, matchMap });

  if (movements.length === 0) {
    return (
      <Card>
        <CardContent className="p-8 text-center text-muted-foreground">
          <History className="w-10 h-10 mx-auto mb-3 opacity-30" />
          <p className="text-sm">Aún no tienes movimientos de puntos.</p>
          <p className="text-xs mt-1">Aquí verás tus bonos, aciertos, comisiones y canjes.</p>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card>
      <CardHeader className="pb-2">
        <CardTitle className="text-base flex items-center gap-2">
          <History className="w-4 h-4 text-foreground" />
          Historial de movimientos
          <Badge variant="outline" className="ml-auto text-[10px] font-normal">
            {movements.length} {movements.length === 1 ? 'movimiento' : 'movimientos'}
          </Badge>
        </CardTitle>
      </CardHeader>
      <CardContent className="p-0">
        <div className="divide-y divide-border/50">
          {movements.map(mv => {
            const style = movementStyles[mv.kind] || movementStyles.bonus;
            const Icon = style.icon;
            const positive = mv.amount > 0;
            return (
              <div key={mv.id} className="px-4 py-3 flex items-center justify-between gap-3">
                <div className="flex items-center gap-3 min-w-0">
                  <div className={`w-8 h-8 rounded-lg ${style.bg} flex items-center justify-center shrink-0`}>
                    <Icon className={`w-4 h-4 ${style.iconClass}`} />
                  </div>
                  <div className="min-w-0">
                    <p className="text-sm font-medium truncate">{mv.title}</p>
                    <p className="text-xs text-muted-foreground truncate">
                      {mv.subtitle}
                      {mv.date && ` · ${new Date(mv.date).toLocaleDateString('es-PA')}`}
                    </p>
                  </div>
                </div>
                {mv.refunded ? (
                  <span className="shrink-0 text-sm font-bold text-muted-foreground line-through decoration-2 opacity-60" title="Puntos devueltos">
                    {mv.amount}
                  </span>
                ) : (
                  <span className={`shrink-0 text-sm font-bold ${positive ? 'text-emerald-600 dark:text-emerald-400' : 'text-red-500'}`}>
                    {positive ? `+${mv.amount}` : mv.amount}
                  </span>
                )}
              </div>
            );
          })}
        </div>
      </CardContent>
    </Card>
  );
}
