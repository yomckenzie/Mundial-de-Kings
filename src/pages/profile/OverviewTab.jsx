import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Sparkles, UserPlus } from 'lucide-react';

export default function OverviewTab({ bonuses, myCommissions, allUsers, matchMap }) {
  return (
    <div className="space-y-4">
      {/* Bonuses history */}
      {bonuses.length > 0 ? (
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-base flex items-center gap-2">
              <Sparkles className="w-4 h-4 text-foreground" />
              Historial de Bonos
            </CardTitle>
          </CardHeader>
          <CardContent className="p-0">
            <div className="divide-y divide-border/50">
              {bonuses.map(b => (
                <div key={b.id} className="px-4 py-3 flex items-start justify-between gap-2">
                  <div>
                    <p className="text-sm font-medium">{b.reason}</p>
                    <p className="text-xs text-muted-foreground">
                      {b.type === 'welcome' ? 'Bono de bienvenida' : 'Bono otorgado'}
                      {b.created_date && ` · ${new Date(b.created_date).toLocaleDateString('es-PA')}`}
                    </p>
                  </div>
                  <Badge className="bg-foreground text-background border-0 shrink-0 font-bold">
                    +{b.points}
                  </Badge>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      ) : (
        <Card>
          <CardContent className="p-6 text-center text-muted-foreground">
            <Sparkles className="w-8 h-8 mx-auto mb-2 opacity-30" />
            <p className="text-sm">Aún no has recibido bonos.</p>
          </CardContent>
        </Card>
      )}

      {/* Commissions history */}
      {myCommissions.length > 0 ? (
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-base flex items-center gap-2">
              <UserPlus className="w-4 h-4 text-emerald-600 dark:text-emerald-400" />
              Historial de comisiones por referidos
            </CardTitle>
          </CardHeader>
          <CardContent className="p-0">
            <div className="divide-y divide-border/50">
              {myCommissions.map(c => {
                const referredUser = allUsers.find(u => u.email === c.from_email);
                const refMatch = matchMap[c.match_id];
                const isRegistration = c.type === 'registration' || !c.match_id;
                return (
                  <div key={c.id} className="px-4 py-3 flex items-start justify-between gap-2">
                    <div>
                      <p className="text-sm font-medium">
                        {isRegistration ? (
                          <>Se registró con tu código: <strong>{referredUser?.full_name || c.from_email}</strong></>
                        ) : (
                          <>{referredUser?.full_name || c.from_email} acertó un pronóstico{refMatch ? ` (${refMatch.team1} vs ${refMatch.team2})` : ''}</>
                        )}
                      </p>
                      <p className="text-xs text-muted-foreground">
                        {isRegistration ? 'Bono por registro' : 'Comisión por acierto de referido'}
                        {c.created_date && ` · ${new Date(c.created_date).toLocaleDateString('es-PA')}`}
                      </p>
                    </div>
                    <Badge className="bg-emerald-500/10 text-emerald-700 dark:text-emerald-300 border-emerald-200 dark:border-emerald-800 shrink-0 font-bold">
                      +{c.points_earned}
                    </Badge>
                  </div>
                );
              })}
            </div>
          </CardContent>
        </Card>
      ) : (
        <Card>
          <CardContent className="p-6 text-center text-muted-foreground">
            <UserPlus className="w-8 h-8 mx-auto mb-2 opacity-30" />
            <p className="text-sm">Aún no has ganado comisiones por referidos.</p>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
