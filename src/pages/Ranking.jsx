import React, { useState, useRef } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { api } from '@/api/client';
import { db } from '@/lib/db';
import { useOutletContext } from 'react-router-dom';
import { m, AnimatePresence } from 'framer-motion';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { Medal, Award, ChevronLeft, ChevronRight, Download,
  Crown, TrendingUp, Users, RefreshCw
} from 'lucide-react';
import html2canvas from 'html2canvas';
import { toast } from 'sonner';
import RankingExportCard from '@/components/RankingExportCard';
import RankingPodium from './ranking/RankingPodium';
import MyRankCard from './ranking/MyRankCard';
import RankingTable from './ranking/RankingTable';

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
  const queryClient = useQueryClient();
  const [refreshing, setRefreshing] = useState(false);
  const [lastSyncedAt, setLastSyncedAt] = useState(null);

  const { data: allUsers = [], isLoading: loadingUsers } = useQuery({
    queryKey: ['ranking'],
    queryFn: async () => {
      const res = await api.functions.invoke('getRanking', {});
      return res.data?.ranking || [];
    },
  });

  // Forzar sync desde Supabase → actualiza prediction_points y total_points
  // de todos los usuarios. Útil cuando el admin acaba de evaluar un
  // partido en otro dispositivo y los puntos aún no llegaron al poll de 60s.
  const handleRefresh = async () => {
    setRefreshing(true);
    try {
      db._init();
      await db._syncAllFromSupabase();
      queryClient.invalidateQueries({ queryKey: ['ranking'] });
      setLastSyncedAt(new Date());
      toast.success('Ranking actualizado');
    } catch (err) {
      toast.error('Error al actualizar: ' + (err?.message || err));
    } finally {
      setRefreshing(false);
    }
  };

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
      <m.div
        className="space-y-6"
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ duration: 0.3 }}
      >
        <Skeleton className="h-12 w-56" />
        <Skeleton className="h-36 w-full rounded-2xl" />
        <RankSkeleton />
      </m.div>
    );
  }

  return (
    <m.div
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
      <m.div className="flex items-end justify-between flex-wrap gap-4" variants={itemVariants}>
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
          <div className="flex items-center gap-2">
            <Button onClick={handleRefresh} size="sm" variant="outline" disabled={refreshing} className="gap-2">
              <RefreshCw className={`w-4 h-4 ${refreshing ? 'animate-spin' : ''}`} />
              <span className="hidden sm:inline">Actualizar</span>
            </Button>
            <Button onClick={handleExportTop10} size="sm" className="gap-2 glow-sm shadow-lg shadow-foreground/10">
              <Download className="w-4 h-4" />
              <span className="hidden sm:inline">Exportar Top 10</span>
            </Button>
          </div>
        )}

        {lastSyncedAt && (
          <p className="w-full text-right text-[11px] text-muted-foreground/60 -mt-1">
            Última sincronización: {lastSyncedAt.toLocaleTimeString('es-PA', { hour: '2-digit', minute: '2-digit', second: '2-digit' })}
          </p>
        )}
      </m.div>

      {/* ─── Podium ─── */}
      <RankingPodium top3={top3} />

      {/* ─── My Position Card ─── */}
      <MyRankCard myUser={myUser} myRank={myRank} allUsers={allUsers} />      {/* ─── Table ─── */}
      <m.div variants={itemVariants}>
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
              <RankingTable pagedUsers={pagedUsers} page={page} pageSize={PAGE_SIZE} user={user} />
            </AnimatePresence>
          </CardContent>
        </Card>
      </m.div>

      {/* ─── Pagination ─── */}
      {totalPages > 1 && (
        <m.div
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
        </m.div>
      )}

      {exportCards}
    </m.div>
  );
}
