import React, { useState, useMemo, useEffect } from 'react';
import { useOutletContext, Link } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { api } from '@/api/client';
import { db } from '@/lib/db';
import { toast } from 'sonner';
import { m, AnimatePresence } from 'framer-motion';
import { Button } from '@/components/ui/button';
import { User, Target, Gift, LogIn, UserPlus } from 'lucide-react';
import ProfileStats from './profile/ProfileStats';
import PointsBreakdown from './profile/PointsBreakdown';
import PredictionsTab from './profile/PredictionsTab';
import RedemptionsTab from './profile/RedemptionsTab';
import OverviewTab from './profile/OverviewTab';
import ReferralsTab from './profile/ReferralsTab';
import PersonalData from './profile/PersonalData';
import ProfileHeader from './profile/ProfileHeader';

const tabs = [
  { id: 'overview', label: 'Resumen', icon: User },
  { id: 'predictions', label: 'Pronósticos', icon: Target },
  { id: 'redemptions', label: 'Canjes', icon: Gift },
  { id: 'referrals', label: 'Referidos', icon: UserPlus },
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


export default function Profile() {
  const { user, setUser } = useOutletContext();
  const [activeTab, setActiveTab] = useState('overview');
  const [editingField, setEditingField] = useState(null);
  const [editValue, setEditValue] = useState('');

  const handleSaveSocial = (field) => {
    const clean = editValue.replace('@', '').trim();
    if (!clean) {
      toast.error('El campo no puede estar vacío');
      return;
    }
    // No guardar si el valor no cambió
    if (clean.toLowerCase() === (user[field] || '').toLowerCase()) {
      setEditingField(null);
      return;
    }
    // Verificar duplicados (case-insensitive, excluyendo al usuario actual)
    const duplicate = db._init().users.find(u =>
      u.id !== user.id &&
      u[field] && u[field].toLowerCase() === clean.toLowerCase()
    );
    if (duplicate) {
      toast.error(`Este usuario de ${field === 'instagram' ? 'Instagram' : 'TikTok'} ya está registrado por otra cuenta`);
      return;
    }
    // Actualizar usuario local + Supabase (vía _persist)
    db.users.update(user.id, { [field]: clean });
    const updated = db.getCurrentUser();
    if (updated) setUser(updated);
    setEditingField(null);
    toast.success(`@${clean} actualizado`);
  };

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
  }, [setUser]);


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

  const { data: myReferrals = [] } = useQuery({
    queryKey: ['my-referrals', userEmail],
    queryFn: () => api.entities.Referral.findByReferrer(userEmail),
    enabled: !!userEmail,
  });

  const { data: allUsers = [] } = useQuery({
    queryKey: ['all-users-profile'],
    queryFn: () => api.entities.User.list(),
  });

  const { data: allCommissions = [] } = useQuery({
    queryKey: ['all-commissions'],
    queryFn: () => api.entities.ReferralCommission.list(),
  });

  const referralPoints = useMemo(() => {
    return allCommissions
      .filter(c => c.to_email === userEmail)
      .reduce((sum, c) => sum + (c.points_earned || 0), 0);
  }, [allCommissions, userEmail]);

  const matchMap = useMemo(() => {
    const map = {};
    matches.forEach(m => { map[m.id] = m; });
    return map;
  }, [matches]);

  const myCommissions = useMemo(() => {
    return [...allCommissions]
      .filter(c => c.to_email === userEmail)
      .sort((a, b) => new Date(b.created_date || 0) - new Date(a.created_date || 0));
  }, [allCommissions, userEmail]);

  if (!user) {
    return (
      <m.div
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
      </m.div>
    );
  }

  const isAdmin = user?.role === 'admin';
  const scoredPreds = isAdmin ? [] : predictions.filter(p => p.scored);
  const correctPreds = isAdmin ? [] : predictions.filter(p => p.is_correct);
  const predictionPoints = user?.prediction_points || 0;
  const bonusPoints = user?.bonus_points || 0;
  const totalPoints = user?.total_points || 0;
  const totalSpent = redemptions
    .filter(r => ['pending', 'approved', 'delivered'].includes(r.status))
    .reduce((sum, r) => sum + (r.points_spent || 0), 0);
  const availablePoints = Math.max(0, totalPoints - totalSpent);
  const accuracy = scoredPreds.length > 0 ? Math.round((correctPreds.length / scoredPreds.length) * 100) : 0;

  const isLoading = loadingPreds || loadingRedeems;

  return (
    <m.div
      className="space-y-6"
      variants={containerVariants}
      initial="hidden"
      animate="visible"
    >
      <ProfileHeader user={user} />

      {/* Stats row */}
      <m.div variants={itemVariants}>
        <ProfileStats predictionsCount={predictions.length} correctCount={correctPreds.length} totalPoints={totalPoints} />
      </m.div>

      {/* Points breakdown */}
      <m.div variants={itemVariants}>
        <PointsBreakdown
          predictionPoints={predictionPoints}
          bonusPoints={bonusPoints}
          referralPoints={referralPoints}
          totalSpent={totalSpent}
          totalPoints={totalPoints}
          availablePoints={availablePoints}
          accuracy={accuracy}
          correctPreds={correctPreds}
          scoredPreds={scoredPreds}
        />
      </m.div>

      {/* Personal Data */}
      <m.div variants={itemVariants}>
        <PersonalData
          user={user}
          editingField={editingField}
          editValue={editValue}
          onStartEdit={(field) => { const val = user?.[field] || ''; setEditValue(val); setEditingField(field); }}
          onChange={(v) => setEditValue(v)}
          onSave={(field) => handleSaveSocial(field)}
          onCancel={() => setEditingField(null)}
        />
      </m.div>

      {/* Tabs */}
      <m.div variants={itemVariants}>
        <div className="flex items-center gap-1 border-b border-border mb-4">
          {tabs.map(tab => (
            <button
              key={tab.id}
              type="button"
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
            <m.div
              key="overview"
              initial={{ opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -8 }}
              transition={{ duration: 0.2 }}
              className="space-y-4"
            >
              <OverviewTab bonuses={bonuses} myCommissions={myCommissions} allUsers={allUsers} matchMap={matchMap} />
            </m.div>
          )}

          {activeTab === 'predictions' && (
            <m.div
              key="predictions"
              initial={{ opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -8 }}
              transition={{ duration: 0.2 }}
            >
              <PredictionsTab predictions={predictions} matchMap={matchMap} isLoading={isLoading} />
            </m.div>
          )}

          {activeTab === 'redemptions' && (
            <m.div
              key="redemptions"
              initial={{ opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -8 }}
              transition={{ duration: 0.2 }}
            >
              <RedemptionsTab redemptions={redemptions} isLoading={isLoading} />
            </m.div>
          )}

          {activeTab === 'referrals' && (
            <m.div
              key="referrals"
              initial={{ opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -8 }}
              transition={{ duration: 0.2 }}
              className="space-y-4"
            >
              <ReferralsTab user={user} myReferrals={myReferrals} referralPoints={referralPoints} allUsers={allUsers} />
            </m.div>
          )}
        </AnimatePresence>
      </m.div>
    </m.div>
  );
}
