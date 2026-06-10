import React, { useState, useMemo } from 'react';
import { useOutletContext } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { api } from '@/api/client';
import { db } from '@/lib/db';
import { m } from 'framer-motion';
import { Card, CardContent } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import { Gift, Trophy, TrendingUp } from 'lucide-react';
import PrizeCard from './prizes/PrizeCard';
import PreviewImageDialog from './prizes/PreviewImageDialog';

const containerVariants = {
  hidden: { opacity: 0 },
  visible: {
    opacity: 1,
    transition: { staggerChildren: 0.06, delayChildren: 0.1 }
  }
};

const itemVariants = {
  hidden: { opacity: 0, y: 20, scale: 0.95 },
  visible: { opacity: 1, y: 0, scale: 1, transition: { duration: 0.4, ease: 'easeOut' } },
  hover: { y: -6, transition: { duration: 0.25, ease: 'easeOut' } }
};

function PrizeSkeleton() {
  return (
    <Card className="overflow-hidden">
      <Skeleton className="aspect-video w-full" />
      <CardContent className="p-4 space-y-3">
        <Skeleton className="h-5 w-32" />
        <Skeleton className="h-4 w-full" />
        <div className="flex justify-between">
          <Skeleton className="h-5 w-20" />
          <Skeleton className="h-5 w-24" />
        </div>
        <Skeleton className="h-9 w-full rounded-md" />
      </CardContent>
    </Card>
  );
}

export default function Prizes() {
  const { user } = useOutletContext();

  const userEmail = user?.email || '';

  const [modal, setModal] = useState({ previewImage: null });

  const { data: prizes = [], isLoading } = useQuery({
    queryKey: ['prizes'],
    queryFn: async () => {
      const allPrizes = await api.entities.Prize.list();
      const active = allPrizes.filter(p => p.status === 'active');
      if (active.length > 0) return active;
      if (allPrizes.length > 0) return allPrizes;
      db.seedIfEmpty();
      const seeded = await api.entities.Prize.list();
      const seededActive = seeded.filter(p => p.status === 'active');
      return seededActive.length > 0 ? seededActive : seeded;
    },
    staleTime: 1000 * 60,
    retry: 1,
  });

  const { data: myRedemptions = [] } = useQuery({
    queryKey: ['my-redemptions-prizes', userEmail],
    queryFn: () => api.entities.Redemption.filter({ user_email: userEmail }),
    enabled: !!userEmail,
  });

  const totalSpent = useMemo(() =>
    myRedemptions.reduce((sum, r) => sum + (r.points_spent || 0), 0),
    [myRedemptions]
  );
  const totalPoints = user?.total_points || 0;
  const availablePoints = Math.max(0, totalPoints - totalSpent);

  if (isLoading) {
    return (
      <m.div
        className="space-y-6"
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ duration: 0.3 }}
      >
        <div className="flex items-center justify-between">
          <Skeleton className="h-10 w-36" />
          <Skeleton className="h-8 w-28 rounded-full" />
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {[1, 2, 3].map(i => <PrizeSkeleton key={i} />)}
        </div>
      </m.div>
    );
  }

  const pointsProgress = prizes.length > 0
    ? Math.min(100, Math.round((availablePoints / Math.max(...prizes.map(p => p.points_cost))) * 100))
    : 0;

  return (
    <m.div
      className="space-y-6"
      variants={containerVariants}
      initial="hidden"
      animate="visible"
    >
      {/* Header */}
      <m.div className="flex items-center justify-between" variants={itemVariants}>
        <div>
          <h1 className="font-display text-4xl tracking-wide">PREMIOS</h1>
          <p className="text-sm text-muted-foreground mt-1">Canjea tus puntos por premios increíbles</p>
        </div>
        {user && (
          <m.div
            className="flex items-center gap-2 bg-muted/50 border border-border px-4 py-2 rounded-full text-sm font-medium"
            initial={{ opacity: 0, x: 10 }}
            animate={{ opacity: 1, x: 0 }}
            transition={{ delay: 0.2 }}
          >
            <Trophy className="w-4 h-4 text-foreground" />
            <span className="text-foreground">
              <span className="font-black">{availablePoints}</span> pts
            <span className="text-xs text-muted-foreground ml-1 font-normal">disp.</span>
            </span>
          </m.div>
        )}
      </m.div>

      {/* Points progress bar */}
      {user && pointsProgress > 0 && (
        <m.div variants={itemVariants}>
          <Card className="overflow-hidden">
            <CardContent className="p-4">
              <div className="flex items-center justify-between mb-2">
                <div className="flex items-center gap-1.5 text-sm text-muted-foreground">
                  <TrendingUp className="w-4 h-4 text-foreground" />
                  Tu progreso
                </div>
                <span className="text-xs font-medium">{totalPoints} pts ganados · {availablePoints} pts disp.</span>
              </div>
              <div className="h-2.5 bg-muted rounded-full overflow-hidden">
                <m.div
                  className="h-full bg-gradient-to-r from-secondary to-amber-500 rounded-full"
                  initial={{ width: 0 }}
                  animate={{ width: `${pointsProgress}%` }}
                  transition={{ duration: 1, ease: 'easeOut', delay: 0.3 }}
                />
              </div>
              <p className="text-[10px] text-muted-foreground mt-1.5 text-right">
                {pointsProgress}% del premio más costoso
              </p>
            </CardContent>
          </Card>
        </m.div>
      )}

      {prizes.length === 0 && (
        <m.div
          className="text-center py-16 space-y-3"
          variants={itemVariants}
        >
          <Gift className="w-14 h-14 text-muted-foreground/20 mx-auto" />
          <p className="text-muted-foreground">No hay premios disponibles en este momento.</p>
          <p className="text-xs text-muted-foreground/60">Vuelve pronto — estamos preparando nuevos premios para ti.</p>
        </m.div>
      )}

      <m.div
        className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4"
        variants={containerVariants}
      >
        {prizes.map((prize, i) => (
          <m.div
            key={prize.id}
            custom={i}
            variants={itemVariants}
            whileHover="hover"
            whileTap={{ scale: 0.98 }}
          >
            <PrizeCard
              prize={prize}
              onPreview={(p) => setModal(m => ({ ...m, previewImage: p }))}
            />
          </m.div>
        ))}
      </m.div>

      <PreviewImageDialog
        prize={modal.previewImage}
        open={!!modal.previewImage}
        onClose={() => setModal(m => ({ ...m, previewImage: null }))}
      />
    </m.div>
  );
}
