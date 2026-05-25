import React, { useState, useRef, useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';
import { api } from '@/api/client';
import { useOutletContext } from 'react-router-dom';
import { motion, AnimatePresence } from 'framer-motion';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import {
  Trophy, Medal, Award, ChevronLeft, ChevronRight, Download,
  Crown, TrendingUp, Target, Zap, ArrowUp, Users
} from 'lucide-react';
import html2canvas from 'html2canvas';
import RankingExportCard from '@/components/RankingExportCard';

const PAGE_SIZE = 20;

const containerVariants = {
  hidden: { opacity: 0 },
  visible: {
    opacity: 1,
    transition: { staggerChildren: 0.04, delayChildren: 0.1 }
  }
};

const itemVariants = {
  hidden: { opacity: 0, y: 16 },
  visible: { opacity: 1, y: 0, transition: { duration: 0.35, ease: [0.25, 0.46, 0.45, 0.94] } }
};

const podiumVariants = {
  hidden: { opacity: 0, scale: 0.8, y: 20 },
  visible: (i) => ({
    opacity: 1, scale: 1, y: 0,
    transition: { delay: 0.15 + i * 0.15, duration: 0.45, ease: 'backOut' }
  }),
  hover: { y: -6, transition: { duration: 0.25 } }
};

function RankSkeleton() {
  return (
    <div className="space-y-3">
      {[1, 2, 3, 4, 5].map(i => (
        <div key={i} className="flex items-center gap-4 p-3">
          <Skeleton className="w-9 h-9 rounded-full" />
          <div className="flex-1 space-y-1.5">
            <Skeleton className="h-4 w-32" />
            <Skeleton className="h-3 w-20" />
          </div>
          <Skeleton className="h-6 w-16 rounded-md" />
        </div>
      ))}
    </div>
  );
}

function getRankBadge(pos) {
  if (pos === 1) return { icon: Crown, color: 'from-foreground to-foreground', bg: 'bg-muted border-muted-foreground/30', text: 'text-foreground' };
  if (pos === 2) return { icon: Medal, color: 'from-foreground to-foreground', bg: 'bg-muted border-muted-foreground/30', text: 'text-foreground' };
  if (pos === 3) return { icon: Award, color: 'from-foreground to-foreground', bg: 'bg-muted border-muted-foreground/30', text: 'text-foreground' };
  if (pos <= 10) return { icon: null, color: 'from-foreground to-foreground', bg: 'bg-muted/50 border-border/50', text: 'text-muted-foreground' };
  return { icon: null, color: null, bg: 'bg-transparent border-transparent', text: 'text-muted-foreground' };
}

function getRowStyle(pos) {
  const base = 'transition-all duration-200 hover:bg-muted/40 hover:scale-[1.002]';
  if (pos === 1) return `${base} bg-gradient-to-r from-foreground/[0.06] via-foreground/[0.03] to-transparent border-l-[3px] border-l-foreground`;
  if (pos === 2) return `${base} bg-gradient-to-r from-foreground/[0.06] via-foreground/[0.03] to-transparent border-l-[3px] border-l-foreground`;
  if (pos === 3) return `${base} bg-gradient-to-r from-foreground/[0.06] via-foreground/[0.03] to-transparent border-l-[3px] border-l-foreground`;
  return `${base} border-l-[3px] border-l-transparent hover:border-l-border`;
}

function getPointGap(currentPoints, previousPoints) {
  if (previousPoints == null || currentPoints == null) return null;
  const diff = previousPoints - currentPoints;
  if (diff <= 0) return null;
  return diff;
}

export default function Ranking() {
  const { user } = useOutletContext();
  const isAdmin = user?.role === 'admin';
  const [page, setPage] = useState(0);
  const [showExportTop10, setShowExportTop10] = useState(false);
  const exportTop10Ref = useRef(null);

  const { data: allUsers = [], isLoading: loadingUsers } = useQuery({
    queryKey: ['ranking'],
    queryFn: async () => {
      const res = await api.functions.invoke('getRanking', {});
      return res.data?.ranking || [];
    },
  });

  const totalPages = Math.ceil(allUsers.length / PAGE_SIZE);
  const pagedUsers = allUsers.slice(page * PAGE_SIZE, (page + 1) * PAGE_SIZE);
  const myRank = allUsers.findIndex(u => u.email === user?.email) + 1;
  const top3 = allUsers.slice(0, 3);
  const myUser = allUsers.find(u => u.email === user?.email);

  const handleExportTop10 = async () => {
    setShowExportTop10(true);
    await new Promise(r => setTimeout(r, 300));
    const canvas = await html2canvas(exportTop10Ref.current, { backgroundColor: null, scale: 2 });
    const link = document.createElement('a');
    link.download = `ranking-top10-${new Date().toISOString().slice(0, 10)}.png`;
    link.href = canvas.toDataURL('image/png');
    link.click();
    setShowExportTop10(false);
  };

  const exportCards = (
    <>
      {showExportTop10 && (
        <div className="fixed top-0 left-[-9999px]">
          <RankingExportCard ref={exportTop10Ref} topUsers={allUsers.slice(0, 10)} title="Top 10 General" />
        </div>
      )}
    </>
  );

  if (loadingUsers) {
    return (
      <motion.div
        className="space-y-6"
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ duration: 0.3 }}
      >
        <Skeleton className="h-12 w-56" />
        <Skeleton className="h-36 w-full rounded-2xl" />
        <RankSkeleton />
      </motion.div>
    );
  }

  return (
    <motion.div
      className="space-y-8 relative"
      variants={containerVariants}
      initial="hidden"
      animate="visible"
    >
      {/* Background decorative orbs */}
      <div className="fixed inset-0 overflow-hidden pointer-events-none -z-10" aria-hidden="true">
        <div className="absolute -top-24 -right-24 w-96 h-96 bg-foreground/5 rounded-full blur-[100px]" />
        <div className="absolute -bottom-24 -left-24 w-80 h-80 bg-foreground/5 rounded-full blur-[100px]" />
      </div>

      {/* ─── Header ─── */}
      <motion.div className="flex items-end justify-between flex-wrap gap-4" variants={itemVariants}>
        <div>
          <div className="flex items-center gap-3 mb-1">
            <div className="w-1.5 h-8 bg-foreground rounded-full" />
            <div>
              <h1 className="font-display text-5xl md:text-6xl tracking-wider leading-none">
                <span className="text-foreground font-black">RANKING</span>
              </h1>
              <p className="text-sm text-muted-foreground mt-2 flex items-center gap-1.5">
                <Users className="w-3.5 h-3.5" />
                <span>{allUsers.length} participante{allUsers.length !== 1 ? 's' : ''}</span>
                {myRank > 0 && (
                  <span className="ml-2 text-foreground font-medium">
                    · Tu puesto: #{myRank}
                  </span>
                )}
              </p>
            </div>
          </div>
        </div>
        {isAdmin && (
          <Button onClick={handleExportTop10} size="sm" className="gap-2 glow-sm shadow-lg shadow-foreground/10">
            <Download className="w-4 h-4" />
            <span className="hidden sm:inline">Exportar Top 10</span>
          </Button>
        )}
      </motion.div>

      {/* ─── Podium ─── */}
      {top3.length >= 3 && (
        <motion.div
          className="grid grid-cols-3 gap-3 md:gap-5"
          variants={containerVariants}
        >
          {[
            { user: top3[1], pos: 2, color: 'from-foreground to-foreground', label: '2º', shadow: 'shadow-foreground/10' },
            { user: top3[0], pos: 1, color: 'from-foreground to-foreground', label: '1º', shadow: 'shadow-foreground/20' },
            { user: top3[2], pos: 3, color: 'from-foreground to-foreground', label: '3º', shadow: 'shadow-foreground/10' },
          ].map((item, i) => (
            <motion.div
              key={item.pos}
              custom={i}
              variants={podiumVariants}
              whileHover="hover"
              className="relative"
            >
              {/* Glow behind 1st */}
              {item.pos === 1 && (
                <div className="absolute -inset-4 bg-foreground/5 rounded-full blur-3xl animate-pulse" />
              )}
              <Card className={`relative overflow-hidden ${item.pos === 1 ? 'ring-2 ring-foreground/20 shadow-xl shadow-foreground/10' : 'shadow-lg'} ${item.shadow}`}>
                <div className={`h-2 bg-gradient-to-r ${item.color}`} />
                <CardContent className={`p-4 md:p-5 text-center ${item.pos === 1 ? 'pt-5 md:pt-6' : ''}`}>
                  {/* Rank badge */}
                  <motion.div
                    className={`w-10 h-10 md:w-12 md:h-12 rounded-full bg-foreground flex items-center justify-center mx-auto mb-3 shadow-lg ${item.pos === 1 ? 'scale-110' : ''}`}
                    animate={item.pos === 1 ? {
                      scale: [1, 1.08, 1],
                      transition: { repeat: Infinity, duration: 2.5, ease: 'easeInOut' }
                    } : undefined}
                  >
                    <Crown className="w-5 h-5 md:w-6 md:h-6 text-white drop-shadow" />
                  </motion.div>

                  {/* Username */}
                  <p className="font-bold text-sm md:text-base truncate leading-tight">
                    @{item.user.instagram}
                  </p>
                  {item.user.full_name && (
                    <p className="text-[10px] md:text-xs text-muted-foreground truncate mt-0.5">
                      {item.user.full_name}
                    </p>
                  )}

                  {/* Points */}
                  <div className="mt-3">
                    <p className="text-2xl md:text-3xl font-black tracking-tight">
                      {item.user.prediction_points || 0}
                    </p>
                    <p className="text-[10px] md:text-xs text-muted-foreground uppercase tracking-widest font-semibold">
                      puntos
                    </p>
                  </div>
                </CardContent>
              </Card>
            </motion.div>
          ))}
        </motion.div>
      )}

      {/* ─── My Position Card ─── */}
      {myRank > 0 && myUser && (
        <motion.div variants={itemVariants}>
          <Card className="gradient-border overflow-hidden relative group">
            <div className="absolute top-0 right-0 w-32 h-32 bg-foreground/5 rounded-full blur-3xl -translate-y-1/2 translate-x-1/2 group-hover:scale-150 transition-transform duration-700" />
            <CardContent className="p-5 md:p-6 flex items-center justify-between relative">
              <div className="flex items-center gap-4">
                <div className="w-12 h-12 rounded-xl bg-foreground flex items-center justify-center shadow-lg group-hover:scale-110 transition-transform duration-300">
                  <Trophy className="w-6 h-6 text-background" />
                </div>
                <div>
                  <p className="text-xs text-muted-foreground font-medium uppercase tracking-wider">
                    Tu posición
                  </p>
                  <motion.p
                    className="text-3xl font-black"
                    initial={{ scale: 0 }}
                    animate={{ scale: 1 }}
                    transition={{ type: 'spring', stiffness: 350, damping: 12, delay: 0.4 }}
                  >
                    #{myRank}
                    <span className="text-sm font-normal text-muted-foreground ml-2">
                      de {allUsers.length}
                    </span>
                  </motion.p>
                </div>
              </div>
              <div className="text-right">
                <p className="text-xs text-muted-foreground font-medium uppercase tracking-wider">Puntos</p>
                <motion.p
                  className="text-3xl font-black text-foreground"
                  initial={{ scale: 0 }}
                  animate={{ scale: 1 }}
                  transition={{ type: 'spring', stiffness: 350, damping: 12, delay: 0.5 }}
                >
                  {myUser.prediction_points || 0}
                </motion.p>
                {myRank > 1 && (
                  <p className="text-[10px] text-muted-foreground mt-0.5 flex items-center gap-0.5 justify-end">
                    <ArrowUp className="w-3 h-3" />
                    a {getPointGap(myUser.prediction_points, allUsers[myRank - 2]?.prediction_points) ?? '-'} del {myRank - 1}º
                  </p>
                )}
              </div>
            </CardContent>
          </Card>
        </motion.div>
      )}

      {/* ─── Table ─── */}
      <motion.div variants={itemVariants}>
        <Card className="overflow-hidden shadow-lg">
          <CardHeader className="pb-3 border-b border-border/50 bg-muted/10">
            <CardTitle className="text-lg flex items-center gap-2.5">
              <div className="w-8 h-8 rounded-lg bg-muted flex items-center justify-center">
                <TrendingUp className="w-4 h-4 text-muted-foreground" />
              </div>
              <span>Tabla General</span>
              <span className="text-xs font-normal text-muted-foreground ml-auto">
                Pág. {page + 1} de {Math.max(1, totalPages)}
              </span>
            </CardTitle>
          </CardHeader>
          <CardContent className="p-0">
            <AnimatePresence mode="wait">
              {pagedUsers.length === 0 ? (
                <motion.div
                  key="empty"
                  className="py-16 text-center"
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                >
                  <div className="w-16 h-16 rounded-2xl bg-muted/30 flex items-center justify-center mx-auto mb-4">
                    <Target className="w-8 h-8 text-muted-foreground/40" />
                  </div>
                  <p className="text-muted-foreground font-medium">No hay usuarios registrados aún.</p>
                  <p className="text-sm text-muted-foreground/60 mt-1">
                    ¡Sé el primero en participar!
                  </p>
                </motion.div>
              ) : (
                <motion.div
                  key="list"
                  className="divide-y divide-border/40"
                  variants={containerVariants}
                  initial="hidden"
                  animate="visible"
                >
                  {/* Header row */}
                  <div className="hidden md:grid grid-cols-12 px-5 py-3 text-[11px] font-bold text-muted-foreground uppercase tracking-[0.12em] bg-muted/20">
                    <div className="col-span-1">#</div>
                    <div className="col-span-7">Usuario</div>
                    <div className="col-span-2 text-right">Puntos</div>
                    <div className="col-span-2 text-right">Diferencia</div>
                  </div>

                  {pagedUsers.map((u, i) => {
                    const pos = page * PAGE_SIZE + i + 1;
                    const isMe = u.email === user?.email;
                    const prevUser = i > 0 ? pagedUsers[i - 1] : null;
                    const gap = getPointGap(u.prediction_points, prevUser?.prediction_points);
                    const badge = getRankBadge(pos);
                    const RankIcon = badge.icon;

                    return (
                      <motion.div
                        key={u.id}
                        custom={i}
                        variants={itemVariants}
                        layout
                        className={`${getRowStyle(pos)} ${isMe ? 'bg-primary/[0.04] border-l-primary border-l-[3px]' : ''}`}
                      >
                        {/* Mobile layout */}
                        <div className="flex items-center justify-between md:hidden px-4 py-3">
                          <div className="flex items-center gap-3 min-w-0 flex-1">
                            {/* Rank badge */}
                            <div className={`w-8 h-8 rounded-full flex items-center justify-center shrink-0 ${pos <= 10 ? badge.bg : ''} ${pos <= 3 ? 'border-2 ' + badge.bg : ''}`}>
                              {RankIcon ? (
                                <RankIcon className={`w-4 h-4 ${badge.text}`} />
                              ) : (
                                <span className={`text-xs font-bold ${badge.text}`}>{pos}</span>
                              )}
                            </div>
                            <div className="min-w-0">
                              <p className="font-semibold text-sm truncate">
                                @{u.instagram}
                                {isMe && <span className="text-foreground text-xs ml-1.5 font-bold">(Tú)</span>}
                              </p>
                              {u.full_name && (
                                <p className="text-[11px] text-muted-foreground truncate">{u.full_name}</p>
                              )}
                            </div>
                          </div>
                          <div className="text-right shrink-0 ml-2">
                            <p className="font-bold text-sm">{u.prediction_points || 0}</p>
                            {gap && (
                              <p className="text-[10px] text-muted-foreground/60">-{gap}</p>
                            )}
                          </div>
                        </div>

                        {/* Desktop layout */}
                        <div className="hidden md:grid grid-cols-12 px-5 py-3.5 items-center">
                          <div className="col-span-1 flex items-center">
                            <div className={`w-9 h-9 rounded-full flex items-center justify-center ${pos <= 10 ? badge.bg : ''} ${pos <= 3 ? 'border-2 ' + badge.bg : ''}`}>
                              {RankIcon ? (
                                <RankIcon className={`w-4 h-4 ${badge.text}`} />
                              ) : (
                                <span className={`text-xs font-bold ${badge.text}`}>{pos}</span>
                              )}
                            </div>
                          </div>
                          <div className="col-span-7">
                            <div className="flex items-center gap-2">
                              <p className="font-semibold text-sm truncate">@{u.instagram}</p>
                              {isMe && (
                                <span className="text-[10px] font-bold text-foreground uppercase tracking-wider px-1.5 py-0.5 rounded-md bg-muted">
                                  Tú
                                </span>
                              )}
                            </div>
                            {u.full_name && (
                              <p className="text-xs text-muted-foreground/70 truncate">{u.full_name}</p>
                            )}
                          </div>
                          <div className="col-span-2 text-right">
                            <p className="font-bold text-base tabular-nums">{u.prediction_points || 0}</p>
                          </div>
                          <div className="col-span-2 text-right">
                            {gap ? (
                              <div className="inline-flex items-center gap-1 text-xs text-muted-foreground/50">
                                <Zap className="w-3 h-3" />
                                <span className="tabular-nums">{gap}</span>
                              </div>
                            ) : (
                              pos === 1 && (
                                <div className="inline-flex items-center gap-1 text-xs text-muted-foreground/60">
                                  <Crown className="w-3 h-3" />
                                  <span>LÍDER</span>
                                </div>
                              )
                            )}
                          </div>
                        </div>
                      </motion.div>
                    );
                  })}
                </motion.div>
              )}
            </AnimatePresence>
          </CardContent>
        </Card>
      </motion.div>

      {/* ─── Pagination ─── */}
      {totalPages > 1 && (
        <motion.div
          className="flex items-center justify-center gap-3"
          variants={itemVariants}
        >
          <Button
            variant="outline"
            size="sm"
            disabled={page === 0}
            onClick={() => setPage(p => p - 1)}
            className="gap-1.5 px-4"
          >
            <ChevronLeft className="w-4 h-4" />
            <span className="hidden sm:inline">Anterior</span>
          </Button>
          <div className="flex items-center gap-1">
            {Array.from({ length: Math.min(totalPages, 5) }, (_, i) => {
              let pageNum;
              if (totalPages <= 5) {
                pageNum = i;
              } else if (page < 3) {
                pageNum = i;
              } else if (page > totalPages - 3) {
                pageNum = totalPages - 5 + i;
              } else {
                pageNum = page - 2 + i;
              }
              return (
                <Button
                  key={pageNum}
                  variant={page === pageNum ? 'default' : 'ghost'}
                  size="sm"
                  className={`w-9 h-9 p-0 text-sm font-bold transition-all ${
                    page === pageNum
                      ? 'bg-foreground text-background hover:bg-foreground/80 shadow-lg shadow-foreground/20 scale-110'
                      : ''
                  }`}
                  onClick={() => setPage(pageNum)}
                >
                  {pageNum + 1}
                </Button>
              );
            })}
          </div>
          <Button
            variant="outline"
            size="sm"
            disabled={page >= totalPages - 1}
            onClick={() => setPage(p => p + 1)}
            className="gap-1.5 px-4"
          >
            <span className="hidden sm:inline">Siguiente</span>
            <ChevronRight className="w-4 h-4" />
          </Button>
        </motion.div>
      )}

      {exportCards}
    </motion.div>
  );
}
