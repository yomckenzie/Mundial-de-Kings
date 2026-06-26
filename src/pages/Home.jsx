import React, { useEffect, useRef } from 'react';
import { Link, useOutletContext } from 'react-router-dom';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { m } from 'framer-motion';
import { Trophy, Target, Gift, Award, TrendingUp, Star, Bell, X } from 'lucide-react';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { toast } from 'sonner';
import SocialFollow from '@/components/SocialFollow';
import HomeBanner from '@/components/HomeBanner';
import { api } from '@/api/client';

const containerVariants = {
  hidden: { opacity: 0 },
  visible: {
    opacity: 1,
    transition: { staggerChildren: 0.08, delayChildren: 0.1 }
  }
};

const itemVariants = {
  hidden: { opacity: 0, y: 20 },
  visible: { opacity: 1, y: 0, transition: { duration: 0.4, ease: 'easeOut' } }
};

const cardVariants = {
  hidden: { opacity: 0, scale: 0.92 },
  visible: (i) => ({
    opacity: 1,
    scale: 1,
    transition: { delay: 0.1 + i * 0.08, duration: 0.35, ease: 'easeOut' }
  }),
  hover: { y: -6, transition: { duration: 0.25, ease: 'easeOut' } }
};

export default function Home() {
  const { user } = useOutletContext();
  const queryClient = useQueryClient();

  const userEmail = user?.email || '';

  const { data: predictions = [] } = useQuery({
    queryKey: ['my-predictions-home', userEmail],
    queryFn: () => api.entities.Prediction.filter({ user_email: userEmail }, '-created_date'),
    enabled: !!userEmail,
  });

  // Notificaciones no leídas del user (toast efímero al cargar la home)
  const { data: unreadNotifs = [] } = useQuery({
    queryKey: ['user-unread-notifications', userEmail],
    queryFn: () => api.entities.UserNotification.filter({ user_email: userEmail, read_at: null }, '-created_date'),
    enabled: !!userEmail,
    staleTime: 0,
  });

  // Mostrar toast por cada notification no leída. Se marca como leída al
  // aparecer o al hacer click en el botón cerrar.
  const shownNotifsRef = useRef(new Set());
  useEffect(() => {
    if (!unreadNotifs.length) return;
    unreadNotifs.forEach(n => {
      if (shownNotifsRef.current.has(n.id)) return;
      shownNotifsRef.current.add(n.id);
      const toastId = toast(
        (toastDelete) => (
          <div className="flex items-start gap-2 pr-2">
            <Bell className="w-4 h-4 mt-0.5 text-amber-500 shrink-0" />
            <div className="flex-1 min-w-0">
              <p className="font-semibold text-sm">{n.title}</p>
              {n.body && <p className="text-xs text-muted-foreground mt-0.5">{n.body}</p>}
            </div>
            <button
              type="button"
              onClick={() => toast.dismiss(toastId)}
              className="shrink-0 text-muted-foreground hover:text-foreground"
              aria-label="Cerrar"
            >
              <X className="w-4 h-4" />
            </button>
          </div>
        ),
        {
          duration: 10000,
          onDismiss: () => {
            api.entities.UserNotification.markRead(n.id).catch(() => {});
            queryClient.invalidateQueries({ queryKey: ['user-unread-notifications', userEmail] });
          },
          onAutoClose: () => {
            api.entities.UserNotification.markRead(n.id).catch(() => {});
            queryClient.invalidateQueries({ queryKey: ['user-unread-notifications', userEmail] });
          },
        }
      );
    });
  }, [unreadNotifs, userEmail, queryClient]);

  const correctPreds = user?.role === 'admin' ? [] : predictions.filter(p => p.is_correct);

  const cards = [
    { icon: Target, title: 'Partidos', desc: 'Haz tus pronósticos', to: '/matches' },
    { icon: Trophy, title: 'Ranking', desc: 'Ve tu posición', to: '/ranking' },
    { icon: Gift, title: 'Premios', desc: 'Canjea tus puntos', to: '/prizes' },
    { icon: Award, title: 'Mis Puntos', desc: `${user?.total_points || 0} pts`, to: '/profile' },
  ];

  return (
    <m.div
      className="space-y-8"
      variants={containerVariants}
      initial="hidden"
      animate="visible"
    >
      {/* Hero Section */}
      <m.div className="text-center pt-2 md:pt-6 space-y-6" variants={itemVariants}>
        <div className="space-y-2">
          <m.h1
            className="font-display text-6xl md:text-8xl tracking-wide text-foreground leading-none"
            initial={{ opacity: 0, y: -20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.5, ease: 'easeOut' }}
          >
            MUNDIAL DE{' '}
            <span className="text-foreground">KINGS</span>
          </m.h1>
          <m.p
            className="text-xs md:text-sm uppercase tracking-[0.2em] text-muted-foreground font-medium"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ delay: 0.2, duration: 0.4 }}
          >
            Kings World Cup 2026
          </m.p>
        </div>

        <HomeBanner />

        {/* Subtitle */}
        <m.div className="flex items-center justify-center gap-2 max-w-xl mx-auto" variants={itemVariants}>
          <p className="text-muted-foreground text-base md:text-lg">
            Síguenos, predice resultados y gana premios
          </p>
        </m.div>

        {/* Points badge */}
        {user && (
          <m.div
            className="inline-flex items-center gap-2.5 bg-muted/50 text-foreground px-5 py-2 rounded-full text-sm font-medium border border-border"
            initial={{ opacity: 0, scale: 0.8 }}
            animate={{ opacity: 1, scale: 1 }}
            transition={{ delay: 0.4, duration: 0.3, type: 'spring' }}
          >
            <Trophy className="w-4 h-4" />
            Tus puntos: <span className="font-bold">{user?.total_points || 0}</span>
          </m.div>
        )}
      </m.div>

      {/* Social Follow */}
      <m.div variants={itemVariants}>
        <SocialFollow />
      </m.div>

      {/* Quick Access Cards */}
      <m.div
        className="grid grid-cols-2 md:grid-cols-4 gap-4"
        variants={containerVariants}
      >
        {cards.map((c, i) => (
          <m.div
            key={c.to}
            custom={i}
            variants={cardVariants}
            whileHover="hover"
            whileTap={{ scale: 0.97 }}
          >
            <Link to={c.to} className="block h-full">
              <Card className="card-hover h-full overflow-hidden relative group">
                {/* Gradient background on hover */}
                <div className="absolute inset-0 opacity-0 group-hover:opacity-5 bg-foreground/5 transition-opacity duration-300" />
                <CardContent className="p-5 text-center space-y-3 relative">
                  <div className="w-12 h-12 rounded-xl bg-foreground flex items-center justify-center mx-auto shadow-lg">
                    <c.icon className="w-6 h-6 text-background" />
                  </div>
                  <div>
                    <p className="font-semibold text-foreground">{c.title}</p>
                    <p className="text-sm text-muted-foreground">{c.desc}</p>
                  </div>
                </CardContent>
              </Card>
            </Link>
          </m.div>
        ))}
      </m.div>

      {/* Welcome Card */}
      <m.div variants={itemVariants}>
        <Card className="overflow-hidden gradient-border">
          <CardContent className="p-6 md:p-8 text-center relative">
            <div className="absolute -top-10 -right-10 w-40 h-40 bg-gradient-to-br from-secondary/10 to-accent/10 rounded-full blur-3xl" />
            <div className="relative">
              <m.div
                className="w-16 h-16 rounded-2xl bg-foreground flex items-center justify-center mx-auto mb-4 shadow-lg"
                initial={{ rotate: -10, scale: 0.95 }}
                animate={{ rotate: 0, scale: 1 }}
                transition={{ delay: 0.6, type: 'spring', stiffness: 200 }}
              >
                <Star className="w-8 h-8 text-background" />
              </m.div>
              <h2 className="font-display text-2xl md:text-3xl tracking-wide mb-3">
                ¡Bienvenido, {user?.full_name?.split(' ')[0] || 'Invitado'}!
              </h2>
              <p className="text-muted-foreground text-sm md:text-base max-w-lg mx-auto leading-relaxed">
                Participa haciendo tus pronósticos en cada partido del Mundial.
                Cada pronóstico tiene 3 picks independientes: ganador, método y marcador de penales.
                Puedes ganar hasta <strong className="text-secondary">150 puntos</strong> por partido.
                Acumula puntos y canjéalos por increíbles premios.
              </p>
              <m.div className="mt-6" whileHover={{ scale: 1.03 }} whileTap={{ scale: 0.97 }}>
                <Link to="/matches">
                  <Button size="lg" className="gap-2 glow-sm">
                    <Target className="w-5 h-5" />
                    Ver Partidos Disponibles
                  </Button>
                </Link>
              </m.div>
            </div>
          </CardContent>
        </Card>
      </m.div>

      {/* Stats Row */}
      {user && (
        <m.div
          className="grid grid-cols-3 gap-4"
          variants={containerVariants}
        >
          {[
            { icon: Target, label: 'Pronósticos', value: predictions.length, color: 'text-foreground' },
            { icon: TrendingUp, label: 'Aciertos', value: correctPreds.length, color: 'text-foreground' },
            { icon: Trophy, label: 'Puntos', value: user?.total_points || 0, color: 'text-foreground' },
          ].map((s, i) => (
            <m.div
              key={s.label}
              custom={i}
              variants={itemVariants}
            >
              <Card className="card-hover">
                <CardContent className="p-4 text-center space-y-1">
                  <s.icon className={`w-5 h-5 ${s.color} mx-auto`} />
                  <p className="text-xl font-bold">{s.value}</p>
                  <p className="text-xs text-muted-foreground">{s.label}</p>
                </CardContent>
              </Card>
            </m.div>
          ))}
        </m.div>
      )}
    </m.div>
  );
}
