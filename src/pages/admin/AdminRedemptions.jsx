import React, { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { api } from '@/api/client';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { CheckCircle2, Package, Instagram, Music2, User, Phone, Fingerprint, Copy, ExternalLink, CalendarDays, Target, Sparkles, Gift, TrendingUp, Clock, Users, ChevronDown, ChevronUp } from 'lucide-react';
import { toast } from 'sonner';
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

function UserProfileCard({ user, open, onClose }) {
  const [expandedSection, setExpandedSection] = useState(null);
  if (!user) return null;

  const userEmail = user.email;

  const { data: predictions = [] } = useQuery({
    queryKey: ['user-predictions', userEmail],
    queryFn: () => api.entities.Prediction.filter({ user_email: userEmail }, '-created_date'),
    enabled: !!userEmail && open,
  });

  const { data: matches = [] } = useQuery({
    queryKey: ['matches-all'],
    queryFn: () => api.entities.Match.list(),
  });

  const { data: bonuses = [] } = useQuery({
    queryKey: ['user-bonuses', userEmail],
    queryFn: () => api.entities.PointsBonus.filter({ user_email: userEmail }, '-created_date'),
    enabled: !!userEmail && open,
  });

  const { data: redemptions = [] } = useQuery({
    queryKey: ['user-redeems', userEmail],
    queryFn: () => api.entities.Redemption.filter({ user_email: userEmail }, '-created_date'),
    enabled: !!userEmail && open,
  });

  const { data: allCommissions = [] } = useQuery({
    queryKey: ['commissions-all'],
    queryFn: () => api.entities.ReferralCommission.list(),
  });

  const { data: allUsers = [] } = useQuery({
    queryKey: ['users-for-commissions'],
    queryFn: () => api.entities.User.list(),
  });

  const matchMap = {};
  matches.forEach(m => { matchMap[m.id] = m; });

  const userCommissions = allCommissions.filter(c => c.to_email === userEmail);
  const totalCommissions = userCommissions.reduce((sum, c) => sum + (c.points_earned || 0), 0);

  const correctPreds = predictions.filter(p => p.is_correct);
  const scoredPreds = predictions.filter(p => p.scored);
  const accuracy = scoredPreds.length > 0 ? Math.round((correctPreds.length / scoredPreds.length) * 100) : 0;
  const totalSpent = redemptions.reduce((sum, r) => sum + (r.points_spent || 0), 0);

  const initials = (user.full_name || user.email || '?')
    .split(' ')
    .map(w => w[0])
    .join('')
    .toUpperCase()
    .slice(0, 2);

  const joinedDate = user.created_date
    ? format(new Date(user.created_date), "d MMM yyyy", { locale: es })
    : '—';

  const toggleSection = (id) => {
    setExpandedSection(prev => prev === id ? null : id);
  };

  const SectionToggle = ({ id, icon: Icon, label, count, color }) => (
    <button
      type="button"
      onClick={() => toggleSection(id)}
      className="w-full flex items-center justify-between p-3 rounded-xl border bg-card hover:bg-accent/50 transition"
    >
      <div className="flex items-center gap-2.5">
        <div className={`w-8 h-8 rounded-lg flex items-center justify-center ${color}`}>
          <Icon className="w-4 h-4 text-white" />
        </div>
        <div className="text-left">
          <p className="text-sm font-semibold">{label}</p>
          <p className="text-xs text-muted-foreground">{count} registros</p>
        </div>
      </div>
      {expandedSection === id ? <ChevronUp className="w-4 h-4 text-muted-foreground" /> : <ChevronDown className="w-4 h-4 text-muted-foreground" />}
    </button>
  );

  return (
    <Dialog open={open} onOpenChange={(o) => { if (!o) onClose(); }}>
      <DialogContent className="max-w-lg max-h-[85vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="sr-only">Perfil del usuario</DialogTitle>
        </DialogHeader>
        <div className="space-y-5">
          {/* Avatar + nombre */}
          <div className="flex flex-col items-center gap-2 pt-2">
            <div className="w-20 h-20 rounded-full bg-gradient-to-br from-primary to-primary/60 flex items-center justify-center shadow-lg">
              <span className="text-2xl font-bold text-primary-foreground">{initials}</span>
            </div>
            <div className="text-center">
              <h2 className="text-lg font-bold">{user.full_name || 'Sin nombre'}</h2>
              <p className="text-sm text-muted-foreground">{user.email}</p>
            </div>
          </div>

          {/* Redes sociales */}
          <div className="grid grid-cols-2 gap-3">
            <a
              href={user.instagram ? `https://instagram.com/${user.instagram}` : '#'}
              target={user.instagram ? '_blank' : undefined}
              rel={user.instagram ? 'noopener noreferrer' : undefined}
              className={`flex items-center gap-2.5 p-3 rounded-xl border transition ${
                user.instagram
                  ? 'bg-gradient-to-r from-pink-50 to-purple-50 dark:from-pink-950/20 dark:to-purple-950/20 border-pink-200 dark:border-pink-800/40 hover:shadow-md'
                  : 'bg-muted/30 border-border/50 opacity-50 cursor-not-allowed'
              }`}
            >
              <div className={`w-9 h-9 rounded-lg flex items-center justify-center ${user.instagram ? 'bg-gradient-to-br from-pink-500 to-purple-600' : 'bg-muted'}`}>
                <Instagram className="w-4 h-4 text-white" />
              </div>
              <div className="min-w-0 flex-1">
                <p className="text-xs text-muted-foreground">Instagram</p>
                <p className="text-sm font-semibold truncate">
                  {user.instagram ? `@${user.instagram}` : 'No registrado'}
                </p>
              </div>
              {user.instagram && <ExternalLink className="w-3.5 h-3.5 text-muted-foreground shrink-0" />}
            </a>

            <a
              href={user.tiktok ? `https://tiktok.com/@${user.tiktok}` : '#'}
              target={user.tiktok ? '_blank' : undefined}
              rel={user.tiktok ? 'noopener noreferrer' : undefined}
              className={`flex items-center gap-2.5 p-3 rounded-xl border transition ${
                user.tiktok
                  ? 'bg-gradient-to-r from-gray-50 to-gray-100 dark:from-gray-900 dark:to-gray-800 border-gray-200 dark:border-gray-700 hover:shadow-md'
                  : 'bg-muted/30 border-border/50 opacity-50 cursor-not-allowed'
              }`}
            >
              <div className={`w-9 h-9 rounded-lg flex items-center justify-center ${user.tiktok ? 'bg-black dark:bg-white' : 'bg-muted'}`}>
                <Music2 className={`w-4 h-4 ${user.tiktok ? 'text-white dark:text-black' : 'text-muted-foreground'}`} />
              </div>
              <div className="min-w-0 flex-1">
                <p className="text-xs text-muted-foreground">TikTok</p>
                <p className="text-sm font-semibold truncate">
                  {user.tiktok ? `@${user.tiktok}` : 'No registrado'}
                </p>
              </div>
              {user.tiktok && <ExternalLink className="w-3.5 h-3.5 text-muted-foreground shrink-0" />}
            </a>
          </div>

          {/* Datos personales */}
          <div className="space-y-2 bg-muted/50 rounded-xl p-4">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2 text-sm">
                <Phone className="w-4 h-4 text-muted-foreground" />
                <span className="text-muted-foreground">WhatsApp</span>
              </div>
              <span className="text-sm font-medium">{user.phone || user.whatsapp || '—'}</span>
            </div>
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2 text-sm">
                <Fingerprint className="w-4 h-4 text-muted-foreground" />
                <span className="text-muted-foreground">Cédula</span>
              </div>
              <span className="text-sm font-mono font-medium">{user.cedula || '—'}</span>
            </div>
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2 text-sm">
                <CalendarDays className="w-4 h-4 text-muted-foreground" />
                <span className="text-muted-foreground">Registrado</span>
              </div>
              <span className="text-sm font-medium">{joinedDate}</span>
            </div>
          </div>

          {/* Resumen de puntos */}
          <div className="grid grid-cols-3 gap-2">
            <div className="bg-gradient-to-b from-yellow-500/10 to-yellow-500/5 rounded-xl p-3 text-center border border-yellow-500/20">
              <p className="text-xl font-black">{user.prediction_points || 0}</p>
              <p className="text-[10px] text-muted-foreground leading-tight">Pronósticos</p>
            </div>
            <div className="bg-gradient-to-b from-emerald-500/10 to-emerald-500/5 rounded-xl p-3 text-center border border-emerald-500/20">
              <p className="text-xl font-black">{user.bonus_points || 0}</p>
              <p className="text-[10px] text-muted-foreground leading-tight">Bonos</p>
            </div>
            <div className="bg-gradient-to-b from-purple-500/10 to-purple-500/5 rounded-xl p-3 text-center border border-purple-500/20">
              <p className="text-xl font-black">{user.referral_points || 0}</p>
              <p className="text-[10px] text-muted-foreground leading-tight">Referidos</p>
            </div>
          </div>

          {/* Total + código referido */}
          <div className="flex items-center justify-between bg-primary/5 rounded-xl p-3 border border-primary/20">
            <div>
              <p className="text-xs text-muted-foreground">Total puntos</p>
              <p className="text-2xl font-black">{user.total_points || 0}</p>
            </div>
            {user.referral_code && (
              <Button
                size="sm"
                variant="outline"
                className="gap-1.5 text-xs"
                onClick={() => {
                  navigator.clipboard.writeText(user.referral_code);
                  toast.success('Código copiado: ' + user.referral_code);
                }}
              >
                <Copy className="w-3 h-3" />
                {user.referral_code}
              </Button>
            )}
          </div>

          {/* Precisión */}
          {accuracy > 0 && (
            <div className="flex items-center gap-2 text-sm text-muted-foreground bg-muted/30 rounded-xl p-3">
              <TrendingUp className="w-4 h-4 text-foreground" />
              Precisión: <span className="font-bold text-foreground">{accuracy}%</span>
              ({correctPreds.length} aciertos de {scoredPreds.length} evaluados)
            </div>
          )}

          {/* Separador historial */}
          <div className="border-t border-border pt-1">
            <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-3">Historial detallado</p>
          </div>

          {/* Pronósticos */}
          <SectionToggle id="predictions" icon={Target} label="Pronósticos" count={predictions.length} color="bg-gradient-to-br from-blue-500 to-blue-600" />
          {expandedSection === 'predictions' && (
            <div className="space-y-1.5 pl-2">
              {predictions.length === 0 ? (
                <p className="text-sm text-muted-foreground py-2 text-center">Sin pronósticos</p>
              ) : (
                predictions.map(pred => {
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
                })
              )}
            </div>
          )}

          {/* Bonos */}
          <SectionToggle id="bonuses" icon={Sparkles} label="Bonos recibidos" count={bonuses.length} color="bg-gradient-to-br from-emerald-500 to-emerald-600" />
          {expandedSection === 'bonuses' && (
            <div className="space-y-1.5 pl-2">
              {bonuses.length === 0 ? (
                <p className="text-sm text-muted-foreground py-2 text-center">Sin bonos</p>
              ) : (
                bonuses.map(b => (
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
                ))
              )}
            </div>
          )}

          {/* Canjes */}
          <SectionToggle id="redemptions" icon={Gift} label="Canjes realizados" count={redemptions.length} color="bg-gradient-to-br from-rose-500 to-rose-600" />
          {expandedSection === 'redemptions' && (
            <div className="space-y-1.5 pl-2">
              {redemptions.length === 0 ? (
                <p className="text-sm text-muted-foreground py-2 text-center">Sin canjes</p>
              ) : (
                redemptions.map(r => (
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
                ))
              )}
              {totalSpent > 0 && (
                <p className="text-xs text-muted-foreground text-right pt-1">Total gastado: <strong className="text-foreground">{totalSpent} pts</strong></p>
              )}
            </div>
          )}

          {/* Comisiones por referidos */}
          <SectionToggle id="commissions" icon={Users} label="Comisiones por referidos" count={userCommissions.length} color="bg-gradient-to-br from-purple-500 to-purple-600" />
          {expandedSection === 'commissions' && (
            <div className="space-y-1.5 pl-2">
              {userCommissions.length === 0 ? (
                <p className="text-sm text-muted-foreground py-2 text-center">Sin comisiones</p>
              ) : (
                userCommissions.map(c => {
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
                })
              )}
              {totalCommissions > 0 && (
                <p className="text-xs text-muted-foreground text-right pt-1">Total comisiones: <strong className="text-foreground">{totalCommissions} pts</strong></p>
              )}
            </div>
          )}

          {/* Resumen total */}
          <div className="bg-gradient-to-br from-primary/10 to-primary/5 rounded-xl p-4 border border-primary/20">
            <p className="text-xs text-muted-foreground mb-1">Resumen de puntos</p>
            <div className="grid grid-cols-2 gap-x-4 gap-y-1 text-sm">
              <span className="text-muted-foreground">Pronósticos acertados</span>
              <span className="text-right font-medium">{correctPreds.length} · {user.prediction_points || 0} pts</span>
              <span className="text-muted-foreground">Bonos recibidos</span>
              <span className="text-right font-medium">{bonuses.length} · {user.bonus_points || 0} pts</span>
              <span className="text-muted-foreground">Comisiones por referidos</span>
              <span className="text-right font-medium">{userCommissions.length} · {totalCommissions} pts</span>
              <span className="text-muted-foreground">Canjes realizados</span>
              <span className="text-right font-medium">{redemptions.length} · -{totalSpent} pts</span>
              <span className="text-muted-foreground font-semibold border-t border-border/50 pt-1 mt-1">Total</span>
              <span className="text-right font-bold border-t border-border/50 pt-1 mt-1">{user.total_points || 0} pts</span>
            </div>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}

export default function AdminRedemptions() {
  const queryClient = useQueryClient();
  const [selectedUser, setSelectedUser] = useState(null);

  const { data: redemptions = [], isLoading } = useQuery({
    queryKey: ['admin-redemptions'],
    queryFn: () => api.entities.Redemption.list('-created_date'),
  });

  const { data: users = [] } = useQuery({
    queryKey: ['admin-users-redemptions'],
    queryFn: () => api.entities.User.list(),
  });

  const userMap = React.useMemo(() => {
    const map = {};
    users.forEach(u => { map[u.email] = u; });
    return map;
  }, [users]);

  const updateStatus = useMutation({
    mutationFn: ({ id, status }) => api.entities.Redemption.update(id, { status }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['admin-redemptions'] });
      toast.success('Estado actualizado');
    },
  });

  if (isLoading) return <p className="text-muted-foreground">Cargando...</p>;

  return (
    <div className="space-y-4">
      <p className="text-sm text-muted-foreground">{redemptions.length} solicitudes de canje</p>

      {redemptions.length === 0 && (
        <p className="text-center text-muted-foreground py-8">No hay canjes todavía.</p>
      )}

      <div className="space-y-2">
        {redemptions.map(r => {
          const user = userMap[r.user_email];
          return (
            <Card key={r.id}>
              <CardContent className="p-3">
                <div className="flex items-start justify-between mb-2">
                  <button
                    type="button"
                    onClick={() => setSelectedUser(user)}
                    className="text-left space-y-1 min-w-0 flex-1 group"
                  >
                    <div className="flex items-center gap-2">
                      <div className="w-7 h-7 rounded-full bg-gradient-to-br from-primary to-primary/60 flex items-center justify-center shrink-0">
                        <User className="w-3.5 h-3.5 text-primary-foreground" />
                      </div>
                      <p className="font-semibold text-sm group-hover:text-primary transition-colors">{r.user_email}</p>
                    </div>
                    <div className="flex items-center gap-1.5 text-xs text-muted-foreground pl-9">
                      <span>
                        {r.created_date && format(new Date(r.created_date), "d MMM yyyy, HH:mm", { locale: es })}
                      </span>
                      {user?.instagram && (
                        <>
                          <span>·</span>
                          <span>📷 @{user.instagram}</span>
                        </>
                      )}
                      {user?.tiktok && (
                        <>
                          <span>·</span>
                          <span>🎵 @{user.tiktok}</span>
                        </>
                      )}
                    </div>
                  </button>
                  <Badge className={statusColors[r.status]}>{statusLabels[r.status]}</Badge>
                </div>
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <Package className="w-4 h-4 text-muted-foreground" />
                    <span className="text-sm">{r.prize_name} · {r.points_spent} pts</span>
                  </div>
                  <div className="flex gap-1">
                    <Button
                      size="sm"
                      variant="outline"
                      className="gap-1"
                      onClick={() => setSelectedUser(user)}
                    >
                      <User className="w-3.5 h-3.5" />
                      Perfil
                    </Button>
                    {r.status === 'pending' && (
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={() => updateStatus.mutate({ id: r.id, status: 'approved' })}
                      >
                        <CheckCircle2 className="w-4 h-4 mr-1" /> Aprobar
                      </Button>
                    )}
                    {r.status === 'approved' && (
                      <Button
                        size="sm"
                        onClick={() => updateStatus.mutate({ id: r.id, status: 'delivered' })}
                      >
                        <Package className="w-4 h-4 mr-1" /> Marcar Entregado
                      </Button>
                    )}
                  </div>
                </div>
              </CardContent>
            </Card>
          );
        })}
      </div>

      {/* Modal perfil visual */}
      {selectedUser && (
        <UserProfileCard
          user={selectedUser}
          open={!!selectedUser}
          onClose={() => setSelectedUser(null)}
        />
      )}
    </div>
  );
}