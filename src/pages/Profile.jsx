import React, { useState, useMemo, useEffect } from 'react';
import { useOutletContext, Link } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { api } from '@/api/client';
import { db } from '@/lib/db';
import { motion, AnimatePresence } from 'framer-motion';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import { User, Trophy, Target, CheckCircle2, X, Gift, Star, Clock, TrendingUp, Award, ChevronRight, Sparkles, LogIn } from 'lucide-react';

const tabs = [
  { id: 'overview', label: 'Resumen', icon: User },
  { id: 'predictions', label: 'Pronósticos', icon: Target },
  { id: 'redemptions', label: 'Canjes', icon: Gift },
];

const containerVariants = {
  hidden: { opacity: 0 },
  visible: {
    opacity: 1,
    transition: { staggerChildren: 0.06, delayChildren: 0.1 }
  }
};

const itemVariants = {
  hidden: { opacity: 0, y: 16 },
  visible: { opacity: 1, y: 0, transition: { duration: 0.35, ease: 'easeOut' } }
};

function InfoRow({ label, value, children }) {
  return (
    <div className="flex items-center justify-between py-1.5">
      <span className="text-sm text-muted-foreground">{label}{children}</span>
      <span className="text-sm font-medium text-right">{value || '—'}</span>
    </div>
  );
}

function StatCard({ icon: Icon, value, label, color, delay = 0 }) {
  const gradientMap = { blue: 'from-foreground to-foreground', emerald: 'from-foreground to-foreground', amber: 'from-foreground to-foreground' };
  const textMap = { blue: 'text-foreground', emerald: 'text-foreground', amber: 'text-foreground' };
  const gradient = gradientMap[color] || 'from-foreground to-foreground';
  const textColor = textMap[color] || 'text-foreground';
  return (
    <motion.div
      initial={{ opacity: 0, y: 12, scale: 0.95 }}
      animate={{ opacity: 1, y: 0, scale: 1 }}
      transition={{ delay, duration: 0.35, ease: 'easeOut' }}
    >
      <Card className="card-hover overflow-hidden">
        <div className={`h-1 bg-gradient-to-r ${gradient}`} />
        <CardContent className="p-4 text-center">
          <Icon className={`w-6 h-6 mx-auto mb-1.5 ${textColor}`} />
          <p className="text-2xl font-black">{value}</p>
          <p className="text-xs text-muted-foreground mt-0.5">{label}</p>
        </CardContent>
      </Card>
    </motion.div>
  );
}

export default function Profile() {
  const { user, setUser } = useOutletContext();
  const [activeTab, setActiveTab] = useState('overview');

  const userEmail = user?.email || '';

  // Refrescar datos del usuario desde localStorage cuando cambien (ej: puntos extra otorgados por admin)
  useEffect(() => {
    const refreshUser = () => {
      const fresh = db.getCurrentUser();
      if (fresh) setUser(fresh);
    };

    // Migración: si el usuario tiene total_points pero le falta bonus_points
    // (ej: usuarios que se registraron antes de que se agregara el campo)
    const migrateMissingBonus = () => {
      const fresh = db.getCurrentUser();
      if (!fresh) return;

      const needsFix = fresh.total_points > 0 && fresh.id &&
        (
          fresh.bonus_points === undefined || fresh.bonus_points === null ||
          (fresh.bonus_points === 0 && (fresh.prediction_points || 0) === 0 && fresh.total_points > 0)
        );

      if (needsFix) {
        const inferredBonus = fresh.total_points - (fresh.prediction_points || 0);
        if (inferredBonus > 0) {
          db.users.update(fresh.id, {
            bonus_points: inferredBonus,
            prediction_points: fresh.prediction_points || 0,
          });
          // Actualizar el estado local
          const updated = db.getCurrentUser();
          if (updated) setUser(updated);
        }
      }
    };

    // Refrescar al montar por si vienes del admin
    refreshUser();
    // Corregir bonus_points faltantes en usuarios existentes
    migrateMissingBonus();

    // Escuchar evento 'db-synced' que se dispara cuando se persisten cambios
    window.addEventListener('db-synced', refreshUser);
    // Refrescar al volver a la pestaña (por si otorgaron puntos en otra)
    window.addEventListener('focus', refreshUser);

    return () => {
      window.removeEventListener('db-synced', refreshUser);
      window.removeEventListener('focus', refreshUser);
    };
  }, []);

  const { data: predictions = [], isLoading: loadingPreds } = useQuery({
    queryKey: ['my-predictions-profile', userEmail],
    queryFn: () => api.entities.Prediction.filter({ user_email: userEmail }, '-created_date'),
    enabled: !!userEmail,
  });

  const { data: matches = [] } = useQuery({
    queryKey: ['matches-profile'],
    queryFn: () => api.entities.Match.list(),
  });

  const { data: redemptions = [], isLoading: loadingRedeems } = useQuery({
    queryKey: ['my-redemptions', userEmail],
    queryFn: () => api.entities.Redemption.filter({ user_email: userEmail }, '-created_date'),
    enabled: !!userEmail,
  });

  const { data: bonuses = [] } = useQuery({
    queryKey: ['my-bonuses', userEmail],
    queryFn: () => api.entities.PointsBonus.filter({ user_email: userEmail }, '-created_date'),
    enabled: !!userEmail,
  });

  const matchMap = useMemo(() => {
    const map = {};
    matches.forEach(m => { map[m.id] = m; });
    return map;
  }, [matches]);

  if (!user) {
    return (
      <motion.div
        className="text-center py-16 space-y-4"
        initial={{ opacity: 0, y: 10 }}
        animate={{ opacity: 1, y: 0 }}
      >
        <User className="w-14 h-14 text-muted-foreground/20 mx-auto" />
        <h1 className="font-display text-3xl tracking-wide">MI PERFIL</h1>
        <p className="text-muted-foreground">Inicia sesión para ver tu perfil.</p>
        <Link to="/login">
          <Button className="gap-2 mt-2">
            <LogIn className="w-4 h-4" />
            Iniciar sesión
          </Button>
        </Link>
      </motion.div>
    );
  }

  const scoredPreds = predictions.filter(p => p.scored);
  const correctPreds = predictions.filter(p => p.is_correct);
  const predictionPoints = user?.prediction_points || 0;
  const bonusPoints = user?.bonus_points || 0;
  const totalPoints = user?.total_points || 0;
  const totalSpent = redemptions.reduce((sum, r) => sum + (r.points_spent || 0), 0);
  const availablePoints = Math.max(0, totalPoints - totalSpent);
  const accuracy = scoredPreds.length > 0 ? Math.round((correctPreds.length / scoredPreds.length) * 100) : 0;

  const isLoading = loadingPreds || loadingRedeems;

  return (
    <motion.div
      className="space-y-6"
      variants={containerVariants}
      initial="hidden"
      animate="visible"
    >
      {/* Header */}
      <motion.div variants={itemVariants}>
        <div className="flex items-center gap-3 mb-1">
          <div className="w-12 h-12 rounded-2xl bg-foreground flex items-center justify-center shadow-lg">
            <User className="w-6 h-6 text-background" />
          </div>
          <div>
            <h1 className="font-display text-4xl tracking-wide">{user?.full_name?.split(' ')[0] || 'Perfil'}</h1>
            <p className="text-sm text-muted-foreground">@{user?.instagram || user?.email}</p>
          </div>
        </div>
      </motion.div>

      {/* Stats row */}
      <motion.div className="grid grid-cols-3 gap-3" variants={itemVariants}>
        <StatCard icon={Target} value={predictions.length} label="Pronósticos" color="blue" delay={0.1} />
        <StatCard icon={CheckCircle2} value={correctPreds.length} label="Aciertos" color="emerald" delay={0.15} />
        <StatCard icon={Trophy} value={totalPoints} label="Puntos ganados" color="amber" delay={0.2} />
      </motion.div>

      {/* Points breakdown */}
      <motion.div variants={itemVariants}>
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
            {/* Puntos usados en canjes */}
            <div className="flex items-center justify-between p-3 bg-muted/30 rounded-lg">
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

            {/* Total ganado (nunca disminuye) */}
            <div className="flex items-center justify-between p-3 bg-muted rounded-lg border border-border">
              <div>
                <span className="font-bold">Total ganado</span>
                <p className="text-xs text-muted-foreground">Nunca disminuye</p>
              </div>
              <span className="font-black text-xl">{totalPoints} pts</span>
            </div>

            {/* Puntos disponibles */}
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
      </motion.div>

      {/* Personal Data */}
      <motion.div variants={itemVariants}>
        <div className="flex items-center gap-2 text-sm font-semibold text-muted-foreground mb-3">
          <User className="w-4 h-4" />
          Datos personales
        </div>
        <Card>
          <CardContent className="p-4">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-x-6 gap-y-1">
              <InfoRow label="Nombre completo" value={user?.full_name} />
              <InfoRow label="Correo electrónico" value={user?.email} />
              <InfoRow label="Cédula" value={user?.cedula} />
              <InfoRow label="Instagram" value={user?.instagram ? `@${user.instagram}` : null} />
              <InfoRow label="TikTok" value={user?.tiktok ? `@${user.tiktok}` : null} />
              <InfoRow label="WhatsApp" value={user?.phone || user?.whatsapp} />
            </div>
          </CardContent>
        </Card>
      </motion.div>

      {/* Tabs */}
      <motion.div variants={itemVariants}>
        <div className="flex items-center gap-1 border-b border-border mb-4">
          {tabs.map(tab => (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id)}
              className={`flex items-center gap-1.5 px-3 py-2.5 text-sm font-medium transition border-b-2 -mb-[1px] ${
                activeTab === tab.id
                  ? 'border-secondary text-foreground'
                  : 'border-transparent text-muted-foreground hover:text-foreground'
              }`}
            >
              <tab.icon className="w-4 h-4" />
              <span className="hidden sm:inline">{tab.label}</span>
            </button>
          ))}
        </div>

        <AnimatePresence mode="wait">
          {activeTab === 'overview' && (
            <motion.div
              key="overview"
              initial={{ opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -8 }}
              transition={{ duration: 0.2 }}
              className="space-y-4"
            >
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
            </motion.div>
          )}

          {activeTab === 'predictions' && (
            <motion.div
              key="predictions"
              initial={{ opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -8 }}
              transition={{ duration: 0.2 }}
            >
              {isLoading ? (
                <div className="space-y-3">
                  {[1, 2, 3].map(i => <Skeleton key={i} className="h-16 w-full rounded-lg" />)}
                </div>
              ) : predictions.length === 0 ? (
                <Card>
                  <CardContent className="p-8 text-center text-muted-foreground">
                    <Target className="w-10 h-10 mx-auto mb-3 opacity-30" />
                    <p>Aún no has hecho pronósticos.</p>
                    <p className="text-xs mt-1">Ve a la sección Partidos para comenzar.</p>
                  </CardContent>
                </Card>
              ) : (
                <div className="space-y-2">
                  {predictions.map((pred, i) => {
                    const match = matchMap[pred.match_id];
                    if (!match) return null;
                    return (
                      <motion.div
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
                      </motion.div>
                    );
                  })}
                </div>
              )}
            </motion.div>
          )}

          {activeTab === 'redemptions' && (
            <motion.div
              key="redemptions"
              initial={{ opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -8 }}
              transition={{ duration: 0.2 }}
            >
              {isLoading ? (
                <div className="space-y-3">
                  {[1, 2, 3].map(i => <Skeleton key={i} className="h-16 w-full rounded-lg" />)}
                </div>
              ) : redemptions.length === 0 ? (
                <Card>
                  <CardContent className="p-8 text-center text-muted-foreground">
                    <Gift className="w-10 h-10 mx-auto mb-3 opacity-30" />
                    <p>No has canjeado premios aún.</p>
                  </CardContent>
                </Card>
              ) : (
                <div className="space-y-2">
                  {redemptions.map((r, i) => (
                    <motion.div
                      key={r.id}
                      initial={{ opacity: 0, y: 8 }}
                      animate={{ opacity: 1, y: 0 }}
                      transition={{ delay: i * 0.05, duration: 0.2 }}
                    >
                      <Card className="card-hover">
                        <CardContent className="p-3 md:p-4 flex items-center justify-between gap-3">
                          <div className="flex items-center gap-3">
                            <div className="w-9 h-9 rounded-lg bg-muted flex items-center justify-center">
                              <Gift className="w-4 h-4 text-muted-foreground" />
                            </div>
                            <div>
                              <p className="font-medium text-sm">{r.prize_name}</p>
                              <p className="text-xs text-muted-foreground">
                                {r.points_spent} pts · {new Date(r.created_date).toLocaleDateString('es-PA')}
                              </p>
                            </div>
                          </div>
                          <Badge variant={r.status === 'delivered' ? 'default' : r.status === 'approved' ? 'secondary' : 'outline'} className="shrink-0">
                            {r.status === 'pending' ? 'Pendiente' : r.status === 'approved' ? 'Aprobado' : 'Entregado'}
                          </Badge>
                        </CardContent>
                      </Card>
                    </motion.div>
                  ))}
                </div>
              )}
            </motion.div>
          )}
        </AnimatePresence>
      </motion.div>
    </motion.div>
  );
}
