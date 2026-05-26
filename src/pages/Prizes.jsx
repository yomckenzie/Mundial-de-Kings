import React from 'react';
import { useOutletContext, Link } from 'react-router-dom';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { api } from '@/api/client';
import { db } from '@/lib/db';
import { motion } from 'framer-motion';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import { Gift, Trophy, Package, UserPlus, Sparkles, TrendingUp } from 'lucide-react';
import { toast } from 'sonner';

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
  const { user, setUser } = useOutletContext();
  const queryClient = useQueryClient();

  const { data: prizes = [], isLoading } = useQuery({
    queryKey: ['prizes'],
    queryFn: async () => {
      // Intentar obtener premios activos
      let prizes = db._init().prizes.filter(p => p.status === 'active');

      // Si no hay premios, forzar la siembra de datos semilla
      if (prizes.length === 0) {
        db.seedIfEmpty();
        prizes = db._init().prizes.filter(p => p.status === 'active');

        // Si aún no hay premios, devolver todos los que existan
        if (prizes.length === 0) {
          const allPrizes = db._init().prizes;
          if (allPrizes.length > 0) return allPrizes;
        }
      }

      return prizes;
    },
    staleTime: 1000 * 60, // 1 minuto antes de considerar datos obsoletos
    retry: 1,
  });

  const redeemMutation = useMutation({
    mutationFn: async (prize) => {
      if ((user?.total_points || 0) < prize.points_cost) {
        throw new Error('No tienes suficientes puntos');
      }
      if (prize.units_available <= 0) {
        throw new Error('Este premio está agotado');
      }

      await api.entities.Redemption.create({
        user_email: user.email,
        prize_id: prize.id,
        prize_name: prize.name,
        points_spent: prize.points_cost,
        status: 'pending',
      });

      const newPoints = (user.total_points || 0) - prize.points_cost;
      await api.auth.updateMe({ total_points: newPoints });

      await api.entities.Prize.update(prize.id, {
        units_available: prize.units_available - 1,
      });

      return newPoints;
    },
    onSuccess: (newPoints) => {
      setUser(prev => ({ ...prev, total_points: newPoints }));
      queryClient.invalidateQueries({ queryKey: ['prizes'] });
      toast.success('¡Premio canjeado exitosamente! El administrador revisará tu solicitud.');
    },
    onError: (err) => {
      toast.error(err.message);
    },
  });

  if (isLoading) {
    return (
      <motion.div
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
      </motion.div>
    );
  }

  const pointsProgress = prizes.length > 0
    ? Math.min(100, Math.round(((user?.total_points || 0) / Math.max(...prizes.map(p => p.points_cost))) * 100))
    : 0;

  return (
    <motion.div
      className="space-y-6"
      variants={containerVariants}
      initial="hidden"
      animate="visible"
    >
      {/* Header */}
      <motion.div className="flex items-center justify-between" variants={itemVariants}>
        <div>
          <h1 className="font-display text-4xl tracking-wide">PREMIOS</h1>
          <p className="text-sm text-muted-foreground mt-1">Canjea tus puntos por premios increíbles</p>
        </div>
        {user && (
          <motion.div
            className="flex items-center gap-2 bg-muted/50 border border-border px-4 py-2 rounded-full text-sm font-medium"
            initial={{ opacity: 0, x: 10 }}
            animate={{ opacity: 1, x: 0 }}
            transition={{ delay: 0.2 }}
          >
            <Trophy className="w-4 h-4 text-foreground" />
            <span className="text-foreground">
              <span className="font-black">{user?.total_points || 0}</span> pts
            </span>
          </motion.div>
        )}
      </motion.div>

      {/* Points progress bar for logged in users */}
      {user && pointsProgress > 0 && (
        <motion.div variants={itemVariants}>
          <Card className="overflow-hidden">
            <CardContent className="p-4">
              <div className="flex items-center justify-between mb-2">
                <div className="flex items-center gap-1.5 text-sm text-muted-foreground">
                  <TrendingUp className="w-4 h-4 text-foreground" />
                  Tu progreso
                </div>
                <span className="text-xs font-medium">{user?.total_points || 0} pts acumulados</span>
              </div>
              <div className="h-2.5 bg-muted rounded-full overflow-hidden">
                <motion.div
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
        </motion.div>
      )}

      {/* Empty state */}
      {prizes.length === 0 && (
        <motion.div
          className="text-center py-16 space-y-3"
          variants={itemVariants}
        >
          <Gift className="w-14 h-14 text-muted-foreground/20 mx-auto" />
          <p className="text-muted-foreground">No hay premios disponibles en este momento.</p>
          <p className="text-xs text-muted-foreground/60">Vuelve pronto — el administrador puede agregar nuevos premios.</p>
        </motion.div>
      )}

      {/* Prize grid */}
      <motion.div
        className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4"
        variants={containerVariants}
      >
        {prizes.map((prize, idx) => {
          const canRedeem = (user?.total_points || 0) >= prize.points_cost && prize.units_available > 0;
          const soldOut = prize.units_available <= 0;
          const progress = user && prize.points_cost > 0 ? Math.min(100, Math.round(((user?.total_points || 0) / prize.points_cost) * 100)) : 0;

          return (
            <motion.div
              key={prize.id}
              custom={idx}
              variants={itemVariants}
              whileHover="hover"
              whileTap={{ scale: 0.98 }}
            >
              <Card className={`overflow-hidden h-full card-hover relative group ${!soldOut && canRedeem ? 'ring-1 ring-secondary/30' : ''} ${soldOut ? 'opacity-75' : ''}`}>
                {/* Gradient overlay on hover */}
                <div className="absolute inset-0 opacity-0 group-hover:opacity-100 bg-gradient-to-b from-transparent via-transparent to-secondary/5 transition-opacity duration-300 pointer-events-none" />

                {/* Prize image */}
                {prize.image_url ? (
                  <div className="aspect-video bg-muted relative overflow-hidden">
                    <img
                      src={prize.image_url}
                      alt={prize.name}
                      className="w-full h-full object-cover transition-transform duration-500 group-hover:scale-105"
                    />
                    {soldOut && (
                      <div className="absolute inset-0 bg-black/60 flex items-center justify-center">
                        <Badge variant="destructive" className="text-sm px-4 py-1">Agotado</Badge>
                      </div>
                    )}
                  </div>
                ) : (
                  <div className="aspect-video bg-gradient-to-br from-muted to-muted/50 flex items-center justify-center relative overflow-hidden">
                    <Gift className="w-14 h-14 text-muted-foreground/20 transition-transform duration-500 group-hover:scale-110" />
                    {soldOut && (
                      <div className="absolute inset-0 bg-black/50 flex items-center justify-center">
                        <Badge variant="destructive" className="text-sm px-4 py-1">Agotado</Badge>
                      </div>
                    )}
                  </div>
                )}

                <CardContent className="p-4 space-y-3 relative">
                  <div className="flex items-start justify-between gap-2">
                    <h3 className="font-bold text-foreground">{prize.name}</h3>
                    {soldOut ? (
                      <Badge variant="destructive" className="shrink-0">Agotado</Badge>
                    ) : (
                      <Badge variant="outline" className="shrink-0 bg-secondary/10 text-secondary border-secondary/20">
                        Activo
                      </Badge>
                    )}
                  </div>

                  {prize.description && (
                    <p className="text-sm text-muted-foreground line-clamp-2 leading-relaxed">{prize.description}</p>
                  )}

                  {/* Points cost bar */}
                  {user && !soldOut && (
                    <div className="space-y-1">
                      <div className="h-1.5 bg-muted rounded-full overflow-hidden">
                        <motion.div
                          className={`h-full rounded-full ${progress >= 100 ? 'bg-secondary' : 'bg-muted-foreground/30'}`}
                          initial={{ width: 0 }}
                          animate={{ width: `${Math.min(progress, 100)}%` }}
                          transition={{ duration: 0.8, ease: 'easeOut', delay: 0.2 + idx * 0.05 }}
                        />
                      </div>
                      <p className="text-[10px] text-muted-foreground">
                        {progress >= 100
                          ? '¡Puntos suficientes!'
                          : `Te faltan ${prize.points_cost - (user?.total_points || 0)} pts`}
                      </p>
                    </div>
                  )}

                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-1.5">
                      <Trophy className="w-4 h-4 text-foreground" />
                      <span className="font-black text-base">{prize.points_cost}</span>
                      <span className="text-xs text-muted-foreground">pts</span>
                    </div>
                    <div className="flex items-center gap-1 text-xs text-muted-foreground">
                      <Package className="w-3.5 h-3.5" />
                      {prize.units_available} {prize.units_available === 1 ? 'disponible' : 'disponibles'}
                    </div>
                  </div>

                  {/* Action button */}
                  {!user ? (
                    <Link to="/register" className="block">
                      <Button variant="outline" className="w-full gap-2">
                        <UserPlus className="w-4 h-4" />
                        Regístrate para canjear
                      </Button>
                    </Link>
                  ) : soldOut ? (
                    <Button className="w-full" disabled>
                      <Package className="w-4 h-4 mr-1.5" />
                      Agotado
                    </Button>
                  ) : (
                    <Button
                      className={`w-full gap-1.5 ${!canRedeem ? 'opacity-70' : 'glow-sm'}`}
                      disabled={!canRedeem || redeemMutation.isPending}
                      onClick={() => redeemMutation.mutate(prize)}
                    >
                      {redeemMutation.isPending ? (
                        <>
                          <span className="w-4 h-4 border-2 border-current border-t-transparent rounded-full animate-spin" />
                          Canjeando...
                        </>
                      ) : canRedeem ? (
                        <>
                          <Sparkles className="w-4 h-4" />
                          Canjear premio
                        </>
                      ) : (
                        <>
                          <Trophy className="w-4 h-4" />
                          Faltan {prize.points_cost - (user?.total_points || 0)} pts
                        </>
                      )}
                    </Button>
                  )}
                </CardContent>
              </Card>
            </motion.div>
          );
        })}
      </motion.div>
    </motion.div>
  );
}
