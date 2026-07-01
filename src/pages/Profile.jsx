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
import { useSocialEdit } from './profile/useSocialEdit';

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

const tabMotionProps = {
  initial: { opacity: 0, y: 8 },
  animate: { opacity: 1, y: 0 },
  exit: { opacity: 0, y: -8 },
  transition: { duration: 0.2 },
};

function NotLoggedIn() {
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

function StatsRow({ predictionsCount, correctCount, totalPoints }) {
  return (
    <m.div variants={itemVariants}>
      <ProfileStats
        predictionsCount={predictionsCount}
        correctCount={correctCount}
        totalPoints={totalPoints}
      />
    </m.div>
  );
}

function PointsBreakdownSection(props) {
  return (
    <m.div variants={itemVariants}>
      <PointsBreakdown
        predictionPoints={props.predictionPoints}
        bonusPoints={props.bonusPoints}
        referralPoints={props.referralPoints}
        totalSpent={props.totalSpent}
        totalPoints={props.totalPoints}
        availablePoints={props.availablePoints}
        accuracy={props.accuracy}
        correctPreds={props.correctPreds}
        scoredPreds={props.scoredPreds}
        v1Points={props.v1Points}
        v2Points={props.v2Points}
        v1Aciertos={props.v1Aciertos}
        v1Total={props.v1Total}
        v2WinnerAciertos={props.v2WinnerAciertos}
        v2MethodAciertos={props.v2MethodAciertos}
        v2ScoreAciertos={props.v2ScoreAciertos}
        v2Total={props.v2Total}
      />
    </m.div>
  );
}

function PersonalDataSection({ user, editingField, editValue, onStartEdit, onChange, onSave, onCancel }) {
  return (
    <m.div variants={itemVariants}>
      <PersonalData
        user={user}
        editingField={editingField}
        editValue={editValue}
        onStartEdit={onStartEdit}
        onChange={onChange}
        onSave={onSave}
        onCancel={onCancel}
      />
    </m.div>
  );
}

function TabsBar({ activeTab, onChange }) {
  return (
    <div className="flex items-center gap-1 border-b border-border mb-4">
      {tabs.map(tab => (
        <button
          key={tab.id}
          type="button"
          onClick={() => onChange(tab.id)}
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
  );
}

function TabContent({ activeTab, props }) {
  if (activeTab === 'overview') {
    return (
      <m.div key="overview" {...tabMotionProps} className="space-y-4">
        <OverviewTab
          bonuses={props.bonuses}
          myCommissions={props.myCommissions}
          allUsers={props.allUsers}
          matchMap={props.matchMap}
          predictions={props.predictions}
          redemptions={props.redemptions}
        />
      </m.div>
    );
  }
  if (activeTab === 'predictions') {
    return (
      <m.div key="predictions" {...tabMotionProps}>
        <PredictionsTab
          predictions={props.predictions}
          matchMap={props.matchMap}
          isLoading={props.isLoading}
        />
      </m.div>
    );
  }
  if (activeTab === 'redemptions') {
    return (
      <m.div key="redemptions" {...tabMotionProps}>
        <RedemptionsTab redemptions={props.redemptions} isLoading={props.isLoading} />
      </m.div>
    );
  }
  if (activeTab === 'referrals') {
    return (
      <m.div key="referrals" {...tabMotionProps} className="space-y-4">
        <ReferralsTab
          user={props.user}
          myReferrals={props.myReferrals}
          referralPoints={props.referralPoints}
          allUsers={props.allUsers}
        />
      </m.div>
    );
  }
  return null;
}

function TabsSection(props) {
  return (
    <m.div variants={itemVariants}>
      <TabsBar activeTab={props.activeTab} onChange={props.onTabChange} />
      <AnimatePresence mode="wait">
        <TabContent activeTab={props.activeTab} props={props} />
      </AnimatePresence>
    </m.div>
  );
}

export default function Profile() {
  const { user, setUser } = useOutletContext();
  const [activeTab, setActiveTab] = useState('overview');
  const {
    editingField,
    editValue,
    startEdit,
    change: onChangeEdit,
    cancel,
    save,
  } = useSocialEdit(user, setUser);

  const userEmail = user?.email || '';

  useEffect(() => {
    const refreshUser = () => {
      const fresh = db.getCurrentUser();
      if (fresh) setUser(fresh);
    };

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
          // await para que un fallo del upsert se propague como rechazo
          // (catch del caller no hace falta aquí: la mutación local ya quedó
          // aplicada por db.users.update antes del await; si Supabase rechaza,
          // el próximo sync FROM corregirá desde la BD — el costo de NO
          // hacer rollback manual es aceptable para esta migración best-effort).
          db.users.update(fresh.id, {
            bonus_points: inferredBonus,
            prediction_points: fresh.prediction_points || 0,
          }).then(() => {
            const updated = db.getCurrentUser();
            if (updated) setUser(updated);
          }).catch((err) => {
            console.warn('[Profile] migrateMissingBonus upsert failed:', err?.message || err);
          });
        }
      }
    };

    refreshUser();
    migrateMissingBonus();

    window.addEventListener('db-synced', refreshUser);
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
    queryFn: () => api.entities.Match.list('-match_date'),
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
    return <NotLoggedIn />;
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

  const v1Scored = predictions.filter(p => p.scored && p.pred_score_team1 == null && p.pred_score_team2 == null);
  const v2Scored = predictions.filter(p => p.scored && p.pred_score_team1 != null);
  const v1Points = v1Scored.reduce((sum, p) => sum + (p.points_earned || 0), 0);
  const v2Points = v2Scored.reduce((sum, p) => sum + (p.points_earned || 0), 0);
  const v1Aciertos = v1Scored.filter(p => (p.points_earned || 0) > 0).length;
  const v2WinnerAciertos = v2Scored.filter(p => p.winner_correct === true).length;
  const v2MethodAciertos = v2Scored.filter(p => p.method_correct === true).length;
  const v2ScoreAciertos = v2Scored.filter(p => p.score_correct === true).length;

  const isLoading = loadingPreds || loadingRedeems;

  return (
    <m.div
      className="space-y-6"
      variants={containerVariants}
      initial="hidden"
      animate="visible"
    >
      <ProfileHeader user={user} />
      <StatsRow
        predictionsCount={predictions.length}
        correctCount={correctPreds.length}
        totalPoints={totalPoints}
      />
      <PointsBreakdownSection
        predictionPoints={predictionPoints}
        bonusPoints={bonusPoints}
        referralPoints={referralPoints}
        totalSpent={totalSpent}
        totalPoints={totalPoints}
        availablePoints={availablePoints}
        accuracy={accuracy}
        correctPreds={correctPreds}
        scoredPreds={scoredPreds}
        v1Points={v1Points}
        v2Points={v2Points}
        v1Aciertos={v1Aciertos}
        v1Total={v1Scored.length}
        v2WinnerAciertos={v2WinnerAciertos}
        v2MethodAciertos={v2MethodAciertos}
        v2ScoreAciertos={v2ScoreAciertos}
        v2Total={v2Scored.length}
      />
      <PersonalDataSection
        user={user}
        editingField={editingField}
        editValue={editValue}
        onStartEdit={(field) => startEdit(field, user?.[field] || '')}
        onChange={(v) => onChangeEdit(v)}
        onSave={(field) => { save(field); }}
        onCancel={() => cancel()}
      />
      <TabsSection
        activeTab={activeTab}
        onTabChange={setActiveTab}
        user={user}
        predictions={predictions}
        matchMap={matchMap}
        redemptions={redemptions}
        bonuses={bonuses}
        myCommissions={myCommissions}
        allUsers={allUsers}
        myReferrals={myReferrals}
        referralPoints={referralPoints}
        isLoading={isLoading}
      />
    </m.div>
  );
}