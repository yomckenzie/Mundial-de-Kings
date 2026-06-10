import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { api } from '@/api/client';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Instagram, Music2, Phone, Fingerprint, CalendarDays, Copy, ExternalLink, Target, Sparkles, Gift, TrendingUp, Users, ChevronDown, ChevronUp } from 'lucide-react';
import { toast } from 'sonner';
import { format } from 'date-fns';
import { es } from 'date-fns/locale/es';
import { PredictionsHistory, BonusesHistory, RedemptionsHistory, CommissionsHistory } from './UserHistorySections';

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

function SectionToggle({ id, icon: Icon, label, count, color, expanded, onToggle }) {
  return (
    <button
      type="button"
      onClick={() => onToggle(id)}
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
      {expanded ? <ChevronUp className="w-4 h-4 text-muted-foreground" /> : <ChevronDown className="w-4 h-4 text-muted-foreground" />}
    </button>
  );
}

export default function UserProfileCard({ user, open, onClose }) {
  const [expandedSection, setExpandedSection] = useState(null);

  const userEmail = user?.email || '';

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

  if (!user) {
    return (
      <Dialog open={false} onOpenChange={() => {}}>
        <DialogContent className="max-w-lg max-h-[85vh] overflow-y-auto" />
      </Dialog>
    );
  }

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
          <SectionToggle id="predictions" icon={Target} label="Pronósticos" count={predictions.length} color="bg-gradient-to-br from-blue-500 to-blue-600" expanded={expandedSection === 'predictions'} onToggle={toggleSection} />
          {expandedSection === 'predictions' && (
            <div className="space-y-1.5 pl-2">
              <PredictionsHistory predictions={predictions} matchMap={matchMap} />
            </div>
          )}

          {/* Bonos */}
          <SectionToggle id="bonuses" icon={Sparkles} label="Bonos recibidos" count={bonuses.length} color="bg-gradient-to-br from-emerald-500 to-emerald-600" expanded={expandedSection === 'bonuses'} onToggle={toggleSection} />
          {expandedSection === 'bonuses' && (
            <div className="space-y-1.5 pl-2">
              <BonusesHistory bonuses={bonuses} />
            </div>
          )}

          {/* Canjes */}
          <SectionToggle id="redemptions" icon={Gift} label="Canjes realizados" count={redemptions.length} color="bg-gradient-to-br from-rose-500 to-rose-600" expanded={expandedSection === 'redemptions'} onToggle={toggleSection} />
          {expandedSection === 'redemptions' && (
            <div className="space-y-1.5 pl-2">
              <RedemptionsHistory redemptions={redemptions} totalSpent={totalSpent} />
            </div>
          )}

          {/* Comisiones por referidos */}
          <SectionToggle id="commissions" icon={Users} label="Comisiones por referidos" count={userCommissions.length} color="bg-gradient-to-br from-purple-500 to-purple-600" expanded={expandedSection === 'commissions'} onToggle={toggleSection} />
          {expandedSection === 'commissions' && (
            <div className="space-y-1.5 pl-2">
              <CommissionsHistory commissions={userCommissions} matchMap={matchMap} allUsers={allUsers} />
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
