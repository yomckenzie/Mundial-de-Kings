import React, { useState, useEffect, useCallback } from 'react';
import { Link, useOutletContext } from 'react-router-dom';
import { motion } from 'framer-motion';
import { Trophy, Target, Gift, Award, Pencil, Check, TrendingUp, Star } from 'lucide-react';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
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
  const isAdmin = user?.role === 'admin';

  const DEFAULT_SUBTITLE = 'Síguenos, predice resultados y gana premios';
  const [heroSubtitle, setHeroSubtitle] = useState(DEFAULT_SUBTITLE);
  const [subtitleRecord, setSubtitleRecord] = useState(null);
  const [editingHero, setEditingHero] = useState(false);
  const [draftSubtitle, setDraftSubtitle] = useState(DEFAULT_SUBTITLE);

  const loadSubtitle = useCallback(() => {
    api.entities.AppSettings.list().then((records) => {
      const rec = records.find(r => r.key === 'hero_subtitle');
      if (rec) {
        setHeroSubtitle(rec.value);
        setDraftSubtitle(rec.value);
        setSubtitleRecord(rec);
      }
    });
  }, []);

  useEffect(() => {
    loadSubtitle();
  }, [loadSubtitle]);

  // Escuchar sincronización desde el servidor compartido
  useEffect(() => {
    const handleSync = () => loadSubtitle();
    window.addEventListener('db-synced', handleSync);
    return () => window.removeEventListener('db-synced', handleSync);
  }, [loadSubtitle]);

  const handleSaveSubtitle = async () => {
    if (subtitleRecord) {
      await api.entities.AppSettings.update(subtitleRecord.id, { key: 'hero_subtitle', value: draftSubtitle });
      setSubtitleRecord(prev => ({ ...prev, value: draftSubtitle }));
    } else {
      const created = await api.entities.AppSettings.create({ key: 'hero_subtitle', value: draftSubtitle });
      setSubtitleRecord(created);
    }
    setHeroSubtitle(draftSubtitle);
    setEditingHero(false);
  };

  const cards = [
    { icon: Target, title: 'Partidos', desc: 'Haz tus pronósticos', to: '/matches' },
    { icon: Trophy, title: 'Ranking', desc: 'Ve tu posición', to: '/ranking' },
    { icon: Gift, title: 'Premios', desc: 'Canjea tus puntos', to: '/prizes' },
    { icon: Award, title: 'Mis Puntos', desc: `${user?.total_points || 0} pts`, to: '/profile' },
  ];

  return (
    <motion.div
      className="space-y-8"
      variants={containerVariants}
      initial="hidden"
      animate="visible"
    >
      {/* Hero Section */}
      <motion.div className="text-center pt-2 md:pt-6 space-y-6" variants={itemVariants}>
        <div className="space-y-2">
          <motion.h1
            className="font-display text-6xl md:text-8xl tracking-wide text-foreground leading-none"
            initial={{ opacity: 0, y: -20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.5, ease: 'easeOut' }}
          >
            MUNDIAL DE{' '}
            <span className="text-foreground">KINGS</span>
          </motion.h1>
          <motion.p
            className="text-xs md:text-sm uppercase tracking-[0.2em] text-muted-foreground font-medium"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ delay: 0.2, duration: 0.4 }}
          >
            Kings World Cup 2026
          </motion.p>
        </div>

        <HomeBanner />

        {/* Subtitle con edición admin */}
        <motion.div
          className="flex items-center justify-center gap-2 max-w-xl mx-auto"
          variants={itemVariants}
        >
          {editingHero ? (
            <motion.div
              className="flex items-center gap-2 w-full max-w-md"
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
            >
              <Input
                value={draftSubtitle}
                onChange={(e) => setDraftSubtitle(e.target.value)}
                className="text-center"
              />
              <Button size="icon" variant="outline" onClick={handleSaveSubtitle}>
                <Check className="w-4 h-4" />
              </Button>
            </motion.div>
          ) : (
            <div className="flex items-center gap-2">
              <p className="text-muted-foreground text-base md:text-lg">{heroSubtitle}</p>
              {isAdmin && (
                <motion.button
                  whileHover={{ scale: 1.1 }}
                  whileTap={{ scale: 0.9 }}
                  onClick={() => setEditingHero(true)}
                  className="text-muted-foreground hover:text-foreground transition"
                >
                  <Pencil className="w-4 h-4" />
                </motion.button>
              )}
            </div>
          )}
        </motion.div>

        {/* Points badge */}
        {user && (
          <motion.div
            className="inline-flex items-center gap-2.5 bg-muted/50 text-foreground px-5 py-2 rounded-full text-sm font-medium border border-border"
            initial={{ opacity: 0, scale: 0.8 }}
            animate={{ opacity: 1, scale: 1 }}
            transition={{ delay: 0.4, duration: 0.3, type: 'spring' }}
          >
            <Trophy className="w-4 h-4" />
            Tus puntos: <span className="font-bold">{user?.total_points || 0}</span>
          </motion.div>
        )}
      </motion.div>

      {/* Social Follow */}
      <motion.div variants={itemVariants}>
        <SocialFollow />
      </motion.div>

      {/* Quick Access Cards */}
      <motion.div
        className="grid grid-cols-2 md:grid-cols-4 gap-4"
        variants={containerVariants}
      >
        {cards.map((c, i) => (
          <motion.div
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
          </motion.div>
        ))}
      </motion.div>

      {/* Welcome Card */}
      <motion.div variants={itemVariants}>
        <Card className="overflow-hidden gradient-border">
          <CardContent className="p-6 md:p-8 text-center relative">
            <div className="absolute -top-10 -right-10 w-40 h-40 bg-gradient-to-br from-secondary/10 to-accent/10 rounded-full blur-3xl" />
            <div className="relative">
              <motion.div
                className="w-16 h-16 rounded-2xl bg-foreground flex items-center justify-center mx-auto mb-4 shadow-lg"
                initial={{ rotate: -10, scale: 0 }}
                animate={{ rotate: 0, scale: 1 }}
                transition={{ delay: 0.6, type: 'spring', stiffness: 200 }}
              >
                <Star className="w-8 h-8 text-background" />
              </motion.div>
              <h2 className="font-display text-2xl md:text-3xl tracking-wide mb-3">
                ¡Bienvenido, {user?.full_name?.split(' ')[0] || 'Invitado'}!
              </h2>
              <p className="text-muted-foreground text-sm md:text-base max-w-lg mx-auto leading-relaxed">
                Participa haciendo tus pronósticos en cada partido del Mundial.
                Si aciertas el resultado exacto, ganas <strong className="text-secondary">100 puntos</strong>.
                Acumula puntos y canjéalos por increíbles premios.
              </p>
              <motion.div className="mt-6" whileHover={{ scale: 1.03 }} whileTap={{ scale: 0.97 }}>
                <Link to="/matches">
                  <Button size="lg" className="gap-2 glow-sm">
                    <Target className="w-5 h-5" />
                    Ver Partidos Disponibles
                  </Button>
                </Link>
              </motion.div>
            </div>
          </CardContent>
        </Card>
      </motion.div>

      {/* Stats Row */}
      {user && (
        <motion.div
          className="grid grid-cols-3 gap-4"
          variants={containerVariants}
        >
          {[
            { icon: Target, label: 'Pronósticos', value: '—', color: 'text-foreground' },
            { icon: TrendingUp, label: 'Aciertos', value: '—', color: 'text-foreground' },
            { icon: Trophy, label: 'Puntos', value: user?.total_points || 0, color: 'text-foreground' },
          ].map((s, i) => (
            <motion.div
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
            </motion.div>
          ))}
        </motion.div>
      )}
    </motion.div>
  );
}
