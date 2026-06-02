import React, { useState, useMemo } from 'react';
import { useOutletContext, Link } from 'react-router-dom';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { api } from '@/api/client';
import { db } from '@/lib/db';
import { motion } from 'framer-motion';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Gift, Trophy, Package, UserPlus, Sparkles, TrendingUp, CheckCircle2, ChevronRight, Search } from 'lucide-react';
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

  const userEmail = user?.email || '';

  const [confirmPrize, setConfirmPrize] = useState(null);
  const [cedulaInput, setCedulaInput] = useState('');
  const [cedulaError, setCedulaError] = useState('');
  const [showSuccess, setShowSuccess] = useState(null);
  const [previewImage, setPreviewImage] = useState(null);

  const { data: prizes = [], isLoading } = useQuery({
    queryKey: ['prizes'],
    queryFn: async () => {
      let prizes = db._init().prizes.filter(p => p.status === 'active');
      if (prizes.length === 0) {
        db.seedIfEmpty();
        prizes = db._init().prizes.filter(p => p.status === 'active');
        if (prizes.length === 0) {
          const allPrizes = db._init().prizes;
          if (allPrizes.length > 0) return allPrizes;
        }
      }
      return prizes;
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

  const redeemMutation = useMutation({
    mutationFn: async (prize) => {
      if (availablePoints < prize.points_cost) {
        throw new Error('No tienes suficientes puntos disponibles');
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

      await api.entities.Prize.update(prize.id, {
        units_available: prize.units_available - 1,
      });

      // NOTA: ya NO descontamos de total_points. total_points representa
      // todos los puntos ganados (nunca disminuye). Los disponibles se
      // calculan como total_points - puntos_gastados_en_canjes.

      return { prize };
    },
    onSuccess: ({ prize }) => {
      queryClient.invalidateQueries({ queryKey: ['prizes'] });
      queryClient.invalidateQueries({ queryKey: ['my-redemptions'] });
      queryClient.invalidateQueries({ queryKey: ['my-bonuses'] });
      setConfirmPrize(null);
      setCedulaInput('');
      setCedulaError('');
      setShowSuccess(prize);
    },
    onError: (err) => {
      toast.error(err.message);
    },
  });

  const openConfirmDialog = (prize) => {
    setCedulaInput('');
    setCedulaError('');
    setConfirmPrize(prize);
  };

  const handleConfirmRedeem = () => {
    const cedula = cedulaInput.trim();
    if (!cedula) {
      setCedulaError('Debes ingresar tu cédula');
      return;
    }
    if (cedula.length < 3) {
      setCedulaError('Ingresa una cédula válida');
      return;
    }
    if (cedula !== user?.cedula) {
      setCedulaError('La cédula no coincide con la registrada. Debe ser la misma que usaste al registrarte.');
      return;
    }
    redeemMutation.mutate(confirmPrize);
  };

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
    ? Math.min(100, Math.round((availablePoints / Math.max(...prizes.map(p => p.points_cost))) * 100))
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
              <span className="font-black">{availablePoints}</span> pts
            <span className="text-xs text-muted-foreground ml-1 font-normal">disp.</span>
            </span>
          </motion.div>
        )}
      </motion.div>

      {/* Points progress bar */}
      {user && pointsProgress > 0 && (
        <motion.div variants={itemVariants}>
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

      {prizes.length === 0 && (
        <motion.div
          className="text-center py-16 space-y-3"
          variants={itemVariants}
        >
          <Gift className="w-14 h-14 text-muted-foreground/20 mx-auto" />
          <p className="text-muted-foreground">No hay premios disponibles en este momento.</p>
          <p className="text-xs text-muted-foreground/60">Vuelve pronto — estamos preparando nuevos premios para ti.</p>
        </motion.div>
      )}

      <motion.div
        className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4"
        variants={containerVariants}
      >
        {prizes.map((prize, i) => {
          const canRedeem = user && availablePoints >= prize.points_cost;
          const soldOut = prize.units_available <= 0;

          return (
            <motion.div
              key={prize.id}
              custom={i}
              variants={itemVariants}
              whileHover="hover"
              whileTap={{ scale: 0.98 }}
            >
              <Card className="overflow-hidden h-full flex flex-col">
                {prize.image_url ? (
                  <div
                    className="aspect-video w-full overflow-hidden cursor-pointer group relative"
                    onClick={() => setPreviewImage(prize)}
                  >
                    <img src={prize.image_url} alt={prize.name} className="w-full h-full object-cover transition-transform duration-300 group-hover:scale-105" />
                    <div className="absolute inset-0 bg-black/0 group-hover:bg-black/20 transition-colors flex items-center justify-center">
                      <div className="w-10 h-10 rounded-full bg-white/90 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity transform scale-75 group-hover:scale-100 duration-200">
                        <Search className="w-[18px] h-[18px]" />
                      </div>
                    </div>
                  </div>
                ) : (
                  <div className="aspect-video w-full bg-muted flex items-center justify-center">
                    <Gift className="w-10 h-10 text-muted-foreground/30" />
                  </div>
                )}
                <CardContent className="p-4 flex flex-col flex-1">
                  <div className="flex items-start justify-between mb-2">
                    <div>
                      <h3 className="font-semibold">{prize.name}</h3>
                    </div>
                    <Badge variant="outline" className="text-xs shrink-0 ml-2">
                      {prize.points_cost} pts
                    </Badge>
                  </div>
                  {prize.description && (
                    <p className="text-sm text-muted-foreground mb-3 flex-1">{prize.description}</p>
                  )}
                  <div className="flex items-center gap-2 mb-3">
                    <Package className="w-3.5 h-3.5 text-muted-foreground" />
                    <div className="text-xs text-muted-foreground">
                      {prize.units_available} {prize.units_available === 1 ? 'disponible' : 'disponibles'}
                    </div>
                  </div>

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
                      onClick={() => openConfirmDialog(prize)}
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
                          Faltan {prize.points_cost - availablePoints} pts
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

      {/* Confirm cedula dialog */}
      <Dialog open={!!confirmPrize} onOpenChange={(open) => { if (!open) { setConfirmPrize(null); setCedulaInput(''); setCedulaError(''); } }}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Gift className="w-5 h-5" />
              Confirmar canje
            </DialogTitle>
          </DialogHeader>
          {confirmPrize && (
            <div className="space-y-4">
              <div className="bg-muted/30 rounded-lg p-3 text-sm space-y-1">
                <p><span className="text-muted-foreground">Premio:</span> <strong>{confirmPrize.name}</strong></p>
                <p><span className="text-muted-foreground">Puntos a canjear:</span> <strong>{confirmPrize.points_cost} pts</strong></p>
              </div>
              <div className="space-y-1.5">
                <label className="text-sm font-medium">
                  Confirma tu número de cédula
                  <span className="ml-1 text-xs text-muted-foreground font-normal">(debe coincidir con la que registraste)</span>
                </label>
                <Input
                  value={cedulaInput}
                  onChange={(e) => { setCedulaInput(e.target.value); setCedulaError(''); }}
                  placeholder="8-000-0000"
                  onKeyDown={(e) => e.key === 'Enter' && handleConfirmRedeem()}
                />
                {cedulaError && <p className="text-xs text-destructive">{cedulaError}</p>}
              </div>
              <Button
                className="w-full gap-2"
                onClick={handleConfirmRedeem}
                disabled={redeemMutation.isPending}
              >
                {redeemMutation.isPending ? (
                  <>
                    <span className="w-4 h-4 border-2 border-current border-t-transparent rounded-full animate-spin" />
                    Canjeando...
                  </>
                ) : (
                  <>
                    <CheckCircle2 className="w-4 h-4" />
                    Confirmar y canjear
                  </>
                )}
              </Button>
            </div>
          )}
        </DialogContent>
      </Dialog>

      {/* Image Preview Dialog */}
      <Dialog open={!!previewImage} onOpenChange={(open) => { if (!open) setPreviewImage(null); }}>
        <DialogContent className="max-w-2xl p-1 bg-black/95 border-0">
          {previewImage && (
            <div className="relative">
              <img
                src={previewImage.image_url}
                alt={previewImage.name}
                className="w-full max-h-[75vh] object-contain rounded-lg"
              />
              <div className="absolute bottom-0 left-0 right-0 bg-gradient-to-t from-black/80 to-transparent p-4 pt-12 rounded-b-lg">
                <p className="text-white font-semibold text-lg">{previewImage.name}</p>
                <p className="text-white/70 text-sm">{previewImage.points_cost} pts · {previewImage.units_available} {previewImage.units_available === 1 ? 'disponible' : 'disponibles'}</p>
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>

      {/* Success dialog */}
      <Dialog open={!!showSuccess} onOpenChange={(open) => { if (!open) setShowSuccess(null); }}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle className="sr-only">Premio canjeado</DialogTitle>
          </DialogHeader>
          {showSuccess && (
            <div className="text-center space-y-4 py-2">
              <motion.div
                initial={{ scale: 0 }}
                animate={{ scale: 1 }}
                transition={{ type: 'spring', stiffness: 200 }}
              >
                <div className="w-16 h-16 rounded-full bg-emerald-500/10 flex items-center justify-center mx-auto">
                  <CheckCircle2 className="w-10 h-10 text-emerald-500" />
                </div>
              </motion.div>
              <div>
                <h3 className="text-xl font-bold">¡Felicidades!</h3>
                <p className="text-sm text-muted-foreground mt-1">
                  Has canjeado <strong>{showSuccess.name}</strong> exitosamente.
                </p>
              </div>
              <div className="bg-muted/30 rounded-lg p-4 text-sm space-y-2 text-left">
                <p className="flex items-center gap-2">
                  <ChevronRight className="w-4 h-4 text-muted-foreground shrink-0" />
                  Te contactaremos vía <strong>WhatsApp</strong> para confirmar tu premio.
                </p>
                <p className="flex items-center gap-2">
                  <ChevronRight className="w-4 h-4 text-muted-foreground shrink-0" />
                  Deberás proporcionar tu dirección de entrega o punto de recogida.
                </p>
                <p className="flex items-center gap-2">
                  <ChevronRight className="w-4 h-4 text-muted-foreground shrink-0" />
                  La cédula registrada se usará para validar tu identidad al entregar el premio.
                </p>
              </div>
              <Button onClick={() => setShowSuccess(null)} className="w-full">
                Entendido
              </Button>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </motion.div>
  );
}