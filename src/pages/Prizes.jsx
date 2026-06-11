import React from 'react';
import { useOutletContext } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { m } from 'framer-motion';
import { Card, CardContent } from '@/components/ui/card';
import { Trophy, TrendingUp, Gift } from 'lucide-react';
import { api } from '@/api/client';
import PrizeCard from './prizes/PrizeCard';

// ─────────────────────────────────────────────────────────────────
// PREMIOS — ahora se consultan de la BD (tabla `prizes`).
// El admin los crea/edita desde /admin/prizes.
// Si la BD está vacía, se muestra un empty state.
// ─────────────────────────────────────────────────────────────────

const containerVariants = {
  hidden: { opacity: 0 },
  visible: {
    opacity: 1,
    transition: { staggerChildren: 0.04, delayChildren: 0.1 }
  }
};

const itemVariants = {
  hidden: { opacity: 0, y: 20, scale: 0.95 },
  visible: { opacity: 1, y: 0, scale: 1, transition: { duration: 0.4, ease: 'easeOut' } },
  hover: { y: -6, transition: { duration: 0.25, ease: 'easeOut' } }
};

export default function Prizes() {
  const { user } = useOutletContext();
  const { data: dbPrizes = [], isLoading } = useQuery({
    queryKey: ['prizes-public'],
    queryFn: () => api.entities.Prize.list('-created_date'),
  });
  // Solo mostrar premios activos y con stock
  const prizes = dbPrizes.filter(p => p.status === 'active' && (p.units_available || 0) > 0);
  const totalPoints = user?.total_points || 0;
  const availablePoints = totalPoints;

  const pointsProgress = prizes.length > 0
    ? Math.min(100, Math.round((availablePoints / Math.max(...prizes.map(p => p.points_cost || 1))) * 100))
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
            <PrizeCard prize={prize} />
          </m.div>
        ))}
      </m.div>

      {!isLoading && prizes.length === 0 && (
        <m.div variants={itemVariants}>
          <Card>
            <CardContent className="p-12 text-center space-y-3">
              <Gift className="w-14 h-14 text-muted-foreground/30 mx-auto" />
              <h2 className="font-display text-2xl">No hay premios disponibles</h2>
              <p className="text-muted-foreground text-sm">
                El catálogo está siendo actualizado. Vuelve pronto para ver nuevos premios.
              </p>
            </CardContent>
          </Card>
        </m.div>
      )}
    </m.div>
  );
}
