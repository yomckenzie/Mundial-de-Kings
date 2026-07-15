import React, { useMemo } from 'react';
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
//
// Orden (jun 2026):
//   - Puntos mayor → menor (default)
//   - Agotados (units_available = 0) al final de la lista
//   - Reactivo: cuando el admin agrega/edita un premio, el sort
//     se reajusta automáticamente (useMemo depende de `prizes`)
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

  // FIX (jul 2026): BUG — doble descuento de canjes.
  //
  // La entity layer `db.prizes.list()` ya devuelve `units_available` calculado
  // dinámicamente (`_getAvailableStock`: BD units_available − canjes activos).
  // Y `sizes` ya viene con las tallas restantes (`_getAvailableSizes` resta
  // canjes por cada selected_size).
  //
  // ANTES: Prizes.jsx restaba OTRA VEZ los canjes activos del `units_available`
  // recibido → para un producto con 6 unidades y 6 canjes activos, el cálculo
  // final daba 6−6=0 y mostraba "Agotado", aunque las tallas 44/45/46 aún
  // tuvieran stock disponible. Síntoma visible: el badge decía "Agotado" pero
  // los botones de tallas grandes seguían clicables.
  //
  // Ahora: respetar el cálculo dinámico de la entity y NO volver a restar.
  const prizes = dbPrizes.filter(p => p.status === 'active');

  const totalPoints = user?.total_points || 0;
  // Descontar puntos ya gastados en canjes activos (pending, approved, delivered)
  const totalSpent = user
    ? activeRedemptions
        .filter(r => r.user_email === user.email)
        .reduce((sum, r) => sum + (Number(r.points_spent) || 0), 0)
    : 0;
  const availablePoints = Math.max(0, totalPoints - totalSpent);

  // ── Orden automático ────────────────────────────────────────────
  // Premios ordenados:
  //   1. Default sort: puntos_cost descendente (mayor → menor).
  //   2. Agotados (units_available <= 0) al final, manteniendo el orden interno.
  // Reactivo: cuando el admin agrega/edita un premio (prizes cambia), el
  // useMemo recalcula el orden automáticamente.
  const sortedPrizes = useMemo(() => {
    const available = prizes.filter(p => p.units_available > 0);
    const sold = prizes.filter(p => p.units_available <= 0);
    const byPointsDesc = (a, b) => (Number(b.points_cost) || 0) - (Number(a.points_cost) || 0);
    available.sort(byPointsDesc);
    sold.sort(byPointsDesc);
    return [...available, ...sold];
  }, [prizes]);

  const pointsProgress = sortedPrizes.length > 0
    ? Math.min(100, Math.round((availablePoints / Math.max(...sortedPrizes.map(p => p.points_cost || 1))) * 100))
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

      {/* Filtro por puntos — eliminado jun 2026 (UX confusa).
          El orden se aplica automáticamente: mayor→menor, agotados al final.
          Cuando el admin agrega/edita un premio, el sort se reajusta solo. */}

      <m.div
        className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4"
        variants={containerVariants}
      >
        {sortedPrizes.map((prize, i) => (
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

      {/* Pie de premios — aclaración sobre disponibilidad */}
      {!isLoading && prizes.length > 0 && (
        <m.div
          variants={itemVariants}
          className="mt-6 px-4 py-3 rounded-lg bg-zinc-950 dark:bg-zinc-950 border border-zinc-800"
        >
          <p className="text-center text-[11px] leading-relaxed">
            <span className="font-bold text-amber-400 uppercase tracking-wide">Disponibilidad sujeta al stock existente.</span>
            {' '}
            <span className="text-zinc-300">Las unidades disponibles pueden agotarse en cualquier momento.</span>
          </p>
        </m.div>
      )}
    </m.div>
  );
}
