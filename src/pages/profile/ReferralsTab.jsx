import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { UserPlus, Users, Copy, Share2, Award } from 'lucide-react';
import { toast } from 'sonner';

export default function ReferralsTab({ user, myReferrals, referralPoints, allUsers }) {
  return (
    <div className="space-y-4">
      {/* Tu código de referido */}
      <Card>
        <CardContent className="p-4 space-y-3">
          <div className="flex items-center gap-2">
            <UserPlus className="w-5 h-5" />
            <h3 className="font-semibold">Tu código de referido</h3>
          </div>
          <div className="flex items-center gap-2 bg-muted rounded-lg p-3">
            <code className="flex-1 text-lg font-bold tracking-wider text-center">
              {user?.referral_code || '—'}
            </code>
            <Button
              size="sm"
              variant="outline"
              className="gap-1.5 shrink-0"
              onClick={() => {
                if (user?.referral_code) {
                  navigator.clipboard.writeText(user.referral_code);
                  toast.success('¡Código copiado!');
                }
              }}
            >
              <Copy className="w-3.5 h-3.5" />
              Copiar
            </Button>
            <Button
              size="sm"
              variant="outline"
              className="gap-1.5 shrink-0"
              onClick={() => {
                if (user?.referral_code) {
                  const url = `${window.location.origin}/register?ref=${user.referral_code}`;
                  navigator.clipboard.writeText(url);
                  toast.success('¡Link de invitación copiado! Compártelo con tus amigos.');
                }
              }}
            >
              <Share2 className="w-3.5 h-3.5" />
              Link
            </Button>
          </div>
          <p className="text-xs text-muted-foreground text-center">
            Comparte tu código para ganar <strong>10 pts</strong> por cada amigo que se registre y <strong>5 pts</strong> por cada acierto de ellos.
          </p>
        </CardContent>
      </Card>

      {/* Estadísticas */}
      <div className="grid grid-cols-2 gap-3">
        <Card>
          <CardContent className="p-4 text-center">
            <Users className="w-6 h-6 mx-auto mb-1 text-foreground" />
            <p className="text-2xl font-black">{myReferrals.length}</p>
            <p className="text-xs text-muted-foreground">Personas referidas</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4 text-center">
            <Award className="w-6 h-6 mx-auto mb-1 text-foreground" />
            <p className="text-2xl font-black">{referralPoints}</p>
            <p className="text-xs text-muted-foreground">Puntos por referidos</p>
          </CardContent>
        </Card>
      </div>

      {/* Lista de referidos */}
      {myReferrals.length > 0 ? (
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-base flex items-center gap-2">
              <Users className="w-4 h-4" />
              Tus referidos
            </CardTitle>
          </CardHeader>
          <CardContent className="p-0">
            <div className="divide-y divide-border/50">
              {myReferrals.map(r => {
                const referredUser = allUsers.find(u => u.email === r.referred_email);
                return (
                  <div key={r.id} className="px-4 py-3 flex items-center justify-between gap-2">
                    <div>
                      <p className="text-sm font-medium">
                        {referredUser?.full_name || r.referred_email}
                      </p>
                      <p className="text-xs text-muted-foreground">
                        @{referredUser?.instagram || '—'} · {new Date(r.created_date).toLocaleDateString('es-PA')}
                      </p>
                    </div>
                    <div className="text-right">
                      <p className="text-xs text-muted-foreground">
                        {referredUser?.prediction_points || 0} pts
                      </p>
                    </div>
                  </div>
                );
              })}
            </div>
          </CardContent>
        </Card>
      ) : (
        <Card>
          <CardContent className="p-6 text-center text-muted-foreground">
            <Users className="w-8 h-8 mx-auto mb-2 opacity-30" />
            <p className="text-sm">Aún no has referido a nadie.</p>
            <p className="text-xs mt-1">Comparte tu código de referido para empezar a ganar puntos extra.</p>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
