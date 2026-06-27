import React from 'react';
import { useOutletContext } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { m } from 'framer-motion';
import { Card, CardContent } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
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
  // Mostrar premios activos (incluso agotados — PrizeCard muestra "Agotado"
  // y desactiva el botón). Filtrar por status=active es la única condición
  // para mostrar; el stock se valida en el botón de canje.
  // Antes: `p.status === 'active' && p.units_available > 0` excluía premios
  // con stock 0, lo que ocultaba premios legítimos al público y daba la
  // impresión de que no había catálogo.
  // Canjes de TODOS los usuarios — vía React Query (reactivo) para que
  // puntos disponibles y stock se actualicen al instante tras canjear,
  // sin recargar la página. Antes se leía db._init() directo (no reactivo).
  const { data: allRedemptions = [] } = useQuery({
    queryKey: ['redemptions-public'],
    queryFn: () => api.entities.Redemption.list(),
  });
  const activeRedemptions = allRedemptions.filter(r =>
    ['pending', 'approved', 'delivered'].includes(r.status)
  );

  // Stock dinámico: el canje pendiente/aprobado/entregado reserva la unidad;
  // si el admin lo rechaza, la unidad regresa al inventario automáticamente.
  const reservedByPrize = activeRedemptions.reduce((acc, r) => {
    acc[r.prize_id] = (acc[r.prize_id] || 0) + 1;
    return acc;
  }, {});
  const prizes = [];
  for (const p of dbPrizes) {
    if (p.status !== 'active') continue;
    prizes.push({
      ...p,
      units_available: Math.max(0, (Number(p.units_available) || 0) - (reservedByPrize[p.id] || 0)),
    });
  }

  const totalPoints = user?.total_points || 0;
  // Descontar puntos ya gastados en canjes activos (pending, approved, delivered)
  const totalSpent = user
    ? activeRedemptions
        .filter(r => r.user_email === user.email)
        .reduce((sum, r) => sum + (Number(r.points_spent) || 0), 0)
    : 0;
  const availablePoints = Math.max(0, totalPoints - totalSpent);

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

      {/* Skeletons mientras llega la primera carga desde Supabase */}
      {isLoading && (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {Array.from({ length: 6 }).map((_, i) => (
            <div key={`sk-${i}`} className="space-y-3">
              <Skeleton className="aspect-video w-full rounded-xl" />
              <Skeleton className="h-5 w-2/3" />
              <Skeleton className="h-4 w-1/3" />
              <Skeleton className="h-9 w-full rounded-md" />
            </div>
          ))}
        </div>
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
            <PrizeCard prize={prize} availablePoints={availablePoints} />
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
                {dbPrizes.length === 0
                  ? 'El catálogo está vacío. Pide al administrador que agregue premios.'
                  : `Hay ${dbPrizes.length} premio${dbPrizes.length === 1 ? '' : 's'} en el catálogo pero ${dbPrizes.length === 1 ? 'está marcado' : 'están marcados'} como inactivo${dbPrizes.length === 1 ? '' : 's'}. Actívalo${dbPrizes.length === 1 ? '' : 's'} desde /admin/prizes.`
                }
              </p>
            </CardContent>
          </Card>
        </m.div>
      )}
    </m.div>
  );
}
