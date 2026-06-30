import React, { useState, useReducer, useRef, useMemo } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { api } from '@/api/client';
import { db } from '@/lib/db';
import { useOutletContext } from 'react-router-dom';
import { m, AnimatePresence } from 'framer-motion';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import { Select, SelectTrigger, SelectContent, SelectItem, SelectValue } from '@/components/ui/select';
import {
  TrendingUp, Users, Calendar,
} from 'lucide-react';
import { toast } from 'sonner';
import RankingExportTemplate from '@/components/RankingExportTemplate';
import RankingPodium from './ranking/RankingPodium';
import MyRankCard from './ranking/MyRankCard';
import RankingTable from './ranking/RankingTable';
import { RankingHeader } from './ranking/RankingHeader';
import { RankingSearch } from './ranking/RankingSearch';
import { RankingPagination } from './ranking/RankingPagination';
import UserProfileCard from '@/components/admin/UserProfileCard';
import { getTournamentWeeks, computeWeeklyRanking } from './ranking/weeklyRanking';

// Normaliza para búsqueda insensible a mayúsculas y acentos
const norm = (s) => (s || '').toString().toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '');

const PAGE_SIZE = 20;

const containerVariants = {
  hidden: { opacity: 0 },
  visible: {
    opacity: 1,
    transition: { staggerChildren: 0.04, delayChildren: 0.1 }
  }
};

// Estado agrupado en un reducer: page, query, selectedWeek, profileUser
// cambian juntos (cambiar filtro resetea paginación), así que un solo set
// evita 4 renders encadenados.
const RANKING_INITIAL = {
  page: 0,
  query: '',
  selectedWeekN: null,  // null = General
  profileUser: null,
};

function rankingReducer(state, action) {
  switch (action.type) {
    case 'SET_PAGE':
      return { ...state, page: action.value };
    case 'SET_QUERY':
      return { ...state, query: action.value, page: 0 };
    case 'SET_WEEK':
      return { ...state, selectedWeekN: action.value, page: 0 };
    case 'SET_PROFILE':
      return { ...state, profileUser: action.value };
    default:
      return state;
  }
}

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

export default function Ranking() {
  const { user } = useOutletContext();
  const isAdmin = user?.role === 'admin';
  const [uiState, dispatch] = useReducer(rankingReducer, RANKING_INITIAL);
  const { page, query, selectedWeekN, profileUser } = uiState;

  const [showExportTop10, setShowExportTop10] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [lastSyncedAt, setLastSyncedAt] = useState(null);
  const exportTop10Ref = useRef(null);
  const queryClient = useQueryClient();

  // Solo admin: lista completa de usuarios (con cédula, teléfono, etc.) para
  // mostrar el perfil detallado al tocar una fila del ranking.
  const { data: fullUsers = [] } = useQuery({
    queryKey: ['ranking-full-users'],
    queryFn: () => api.entities.User.list(),
    enabled: isAdmin,
  });

  const openProfile = isAdmin
    ? (rowUser) => dispatch({ type: 'SET_PROFILE', value: fullUsers.find(fu => fu.email === rowUser.email) || rowUser })
    : undefined;

  const { data: allUsers = [], isLoading: loadingUsers } = useQuery({
    queryKey: ['ranking'],
    queryFn: async () => {
      const res = await api.functions.invoke('getRanking', {});
      return res.data?.ranking || [];
    },
  });

  // Partidos y predicciones (del caché local) para el ranking semanal
  const { data: matchesData = [] } = useQuery({
    queryKey: ['ranking-matches'],
    queryFn: () => api.entities.Match.list('-match_date'),
  });
  const { data: predictionsData = [] } = useQuery({
    queryKey: ['ranking-predictions'],
    queryFn: () => api.entities.Prediction.list(),
  });

  // Forzar sync desde Supabase → actualiza prediction_points y total_points
  // de todos los usuarios.
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

  // Ranking general (posición + diferencia con el de arriba), calculado una sola vez.
  const rankedUsers = useMemo(() =>
    allUsers.map((u, i) => ({
      ...u,
      rank: i + 1,
      gapToPrev: i > 0
        ? Math.max(0, (allUsers[i - 1].prediction_points || 0) - (u.prediction_points || 0))
        : 0,
    })), [allUsers]);

  // Semanas del torneo (solo las ya empezadas) y semana seleccionada.
  const weeks = useMemo(() => getTournamentWeeks(matchesData, Date.now()), [matchesData]);
  const selectedWeek = selectedWeekN != null ? weeks.find(w => w.n === selectedWeekN) || null : null;
  const isWeekly = !!selectedWeek;

  // Ranking de la semana seleccionada (puntos = aciertos de esa semana × 100).
  const weeklyRanked = useMemo(() =>
    selectedWeek ? computeWeeklyRanking(allUsers, predictionsData, matchesData, selectedWeek) : [],
    [selectedWeek, allUsers, predictionsData, matchesData]);

  // Vista activa: semanal o general.
  const baseRanked = isWeekly ? weeklyRanked : rankedUsers;

  // Filtro solo-admin: por Instagram o email (insensible a mayúsculas/acentos)
  const isFiltering = isAdmin && query.trim() !== '';
  const filteredUsers = useMemo(() => {
    if (!isFiltering) return baseRanked;
    const q = norm(query.trim());
    return baseRanked.filter(u => norm(u.instagram).includes(q) || norm(u.email).includes(q));
  }, [baseRanked, query, isFiltering]);

  // Al filtrar se muestran TODAS las coincidencias (sin paginar)
  const totalPages = isFiltering ? 1 : Math.ceil(filteredUsers.length / PAGE_SIZE);
  const pagedUsers = isFiltering
    ? filteredUsers
    : filteredUsers.slice(page * PAGE_SIZE, (page + 1) * PAGE_SIZE);
  const myRank = baseRanked.findIndex(u => u.email === user?.email) + 1;
  const top3 = baseRanked.slice(0, 3);
  const myUser = baseRanked.find(u => u.email === user?.email);

  const handleExportTop10 = async () => {
    setShowExportTop10(true);
    await new Promise(r => setTimeout(r, 60));
    const imgEl = exportTop10Ref.current?.querySelector('img');
    if (imgEl && !imgEl.complete) {
      await new Promise((res) => { imgEl.onload = res; imgEl.onerror = res; });
    }
    await new Promise(r => setTimeout(r, 120));
    try {
      const html2canvas = (await import('html2canvas')).default;
      const canvas = await html2canvas(exportTop10Ref.current, { backgroundColor: null, scale: 2, useCORS: true });
      const link = document.createElement('a');
      link.download = `ranking-top10-${new Date().toISOString().slice(0, 10)}.png`;
      link.href = canvas.toDataURL('image/png');
      link.click();
    } catch (e) {
      toast.error('Error al exportar: ' + (e?.message || e));
    } finally {
      setShowExportTop10(false);
    }
  };

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

      <RankingHeader
        allUsers={allUsers}
        myRank={myRank}
        isAdmin={isAdmin}
        refreshing={refreshing}
        lastSyncedAt={lastSyncedAt}
        onRefresh={handleRefresh}
        onExport={handleExportTop10}
      />

      {/* ─── Selector de semana ─── */}
      {weeks.length > 0 && (
        <m.div variants={{ hidden: { opacity: 0, y: 16 }, visible: { opacity: 1, y: 0 } }} className="flex items-center gap-2">
          <Calendar className="w-4 h-4 text-muted-foreground shrink-0" />
          <Select
            value={isWeekly ? String(selectedWeekN) : 'general'}
            onValueChange={(v) => dispatch({ type: 'SET_WEEK', value: v === 'general' ? null : Number(v) })}
          >
            <SelectTrigger className="w-auto min-w-[180px]">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="general">General</SelectItem>
              {weeks.map(w => (
                <SelectItem key={w.n} value={String(w.n)}>{w.label} · {w.dateLabel}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </m.div>
      )}

      {/* ─── Buscador (solo admin) ─── */}
      {isAdmin && (
        <RankingSearch
          value={query}
          onChange={(v) => dispatch({ type: 'SET_QUERY', value: v })}
          matchCount={filteredUsers.length}
        />
      )}

      {/* ─── Podium ─── */}
      <RankingPodium top3={top3} onUserClick={openProfile} />

      {/* ─── My Position Card ─── */}
      <MyRankCard myUser={myUser} myRank={myRank} allUsers={baseRanked} />

      {/* ─── Table ─── */}
      <m.div variants={{ hidden: { opacity: 0, y: 16 }, visible: { opacity: 1, y: 0 } }}>
        <Card className="overflow-hidden shadow-lg">
          <CardHeader className="pb-3 border-b border-border/50 bg-muted/10">
            <CardTitle className="text-lg flex items-center gap-2.5">
              <div className="w-8 h-8 rounded-lg bg-muted flex items-center justify-center">
                <TrendingUp className="w-4 h-4 text-muted-foreground" />
              </div>
              <span>{isWeekly ? `${selectedWeek.label} · ${selectedWeek.dateLabel}` : 'Tabla General'}</span>
              <span className="text-xs font-normal text-muted-foreground ml-auto">
                {isFiltering ? 'Resultados de búsqueda' : `Pág. ${page + 1} de ${Math.max(1, totalPages)}`}
              </span>
            </CardTitle>
          </CardHeader>
          <CardContent className="p-0">
            <AnimatePresence mode="wait">
              <RankingTable
                pagedUsers={pagedUsers}
                page={page}
                pageSize={PAGE_SIZE}
                user={user}
                isFiltering={isFiltering}
                onUserClick={openProfile}
                emptyMessage={isWeekly && !isFiltering ? 'Nadie acertó en esta semana todavía.' : undefined}
              />
            </AnimatePresence>
          </CardContent>
        </Card>
      </m.div>

      <RankingPagination
        page={page}
        totalPages={totalPages}
        onPageChange={(p) => dispatch({ type: 'SET_PAGE', value: p })}
      />

      {/* Tarjeta oculta usada SOLO para exportar top 10. */}
      {showExportTop10 && (
        <div className="fixed top-0 left-[-9999px]">
          <RankingExportTemplate ref={exportTop10Ref} topUsers={allUsers.slice(0, 10)} title="TOP 10" />
        </div>
      )}

      {/* Perfil completo del usuario (solo admin, al tocar una fila/podio) */}
      {isAdmin && (
        <UserProfileCard
          user={profileUser}
          open={!!profileUser}
          onClose={() => dispatch({ type: 'SET_PROFILE', value: null })}
        />
      )}
    </m.div>
  );
}