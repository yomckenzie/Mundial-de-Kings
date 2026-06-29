import React from 'react';
import { Outlet, useNavigate, useLocation, Link } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { m } from 'framer-motion';
import { UserPlus } from 'lucide-react';
import Navbar from './Navbar';
import PanamaClockWidget from '@/components/PanamaClockWidget';
import PrizeAnnouncementModal from '@/components/PrizeAnnouncementModal';
import { Button } from '@/components/ui/button';
import { api } from '@/api/client';
import { useAuth } from '@/lib/AuthContext';
import Preloader from '@/components/Preloader';

// Flag en sessionStorage: si ya se mostró/dismissó el modal en esta sesión,
// no lo mostramos de nuevo. sessionStorage se limpia al cerrar la pestaña,
// por lo que en la próxima sesión el usuario lo verá de nuevo si todavía
// tiene puntos disponibles.
const PRIZE_MODAL_FLAG = 'prize-modal-dismissed-this-session';

// Umbral mínimo de puntos disponibles para mostrar el anuncio.
// Solo usuarios con >= este saldo ven el modal — evita molestar a usuarios
// con pocos puntos que aún no pueden reclamar nada.
const PRIZE_MODAL_MIN_PTS = 500;

export default function AppLayout() {
  const navigate = useNavigate();
  const location = useLocation();
  const { user, isLoadingAuth, refreshUser } = useAuth();
  const [showPrizeModal, setShowPrizeModal] = React.useState(false);

  // Canjes del usuario para calcular disponibles en tiempo real.
  // (No dependemos del cálculo del componente Prizes porque aquí se necesita
  // apenas arranca la app, sin montar la página de premios.)
  const { data: redemptions = [] } = useQuery({
    queryKey: ['my-redemptions-layout', user?.email],
    queryFn: () => api.entities.Redemption.filter({ user_email: user.email }, '-created_date'),
    enabled: !!user?.email,
  });

  const totalPoints = user?.total_points || 0;
  const totalSpent = redemptions
    .filter(r => ['pending', 'approved', 'delivered'].includes(r.status))
    .reduce((sum, r) => sum + (Number(r.points_spent) || 0), 0);
  const availablePoints = Math.max(0, totalPoints - totalSpent);

  // Disparar el modal: una vez por sesión, solo si tiene >= PRIZE_MODAL_MIN_PTS disponibles.
  React.useEffect(() => {
    if (!user || isLoadingAuth) return;
    if (availablePoints < PRIZE_MODAL_MIN_PTS) return;
    if (typeof window === 'undefined') return;
    if (window.sessionStorage.getItem(PRIZE_MODAL_FLAG) === '1') return;
    // Pequeño delay para que la app termine de pintar antes de mostrar el modal.
    const t = setTimeout(() => setShowPrizeModal(true), 600);
    return () => clearTimeout(t);
  }, [user, isLoadingAuth, availablePoints]);

  const handleClosePrizeModal = () => {
    try { window.sessionStorage.setItem(PRIZE_MODAL_FLAG, '1'); } catch {}
    setShowPrizeModal(false);
  };

  // Si el user existe pero no completó perfil (y no es admin), enviar a /complete-profile
  // — comportamiento previo del componente.
  React.useEffect(() => {
    if (user && !user.profile_complete && user.role !== 'admin') {
      navigate('/complete-profile');
    }
  }, [user, navigate]);

  if (isLoadingAuth) {
    return (
      <div className="fixed inset-0 flex items-center justify-center bg-background">
        <Preloader />
      </div>
    );
  }

  const setUser = () => refreshUser();

  return (
    <div className="min-h-screen bg-background">
      <Navbar user={user} />
      <div className="border-b border-border bg-muted/50 flex flex-col items-center justify-center gap-2 py-2 px-3">
        <PanamaClockWidget />
        {!user && (
          <Link to="/register" className="shrink-0">
            <Button
              size="sm"
              className="gap-1.5 h-7 sm:h-8 px-3 text-[11px] sm:text-xs font-semibold bg-yellow-400 text-black hover:bg-yellow-300 border-0"
            >
              <UserPlus className="w-3 h-3 sm:w-3.5 sm:w-3.5" />
              Crear cuenta
            </Button>
          </Link>
        )}
      </div>
      <main className="max-w-6xl mx-auto px-4 py-6">
        <m.div
          key={location.pathname}
          initial={{ opacity: 0, y: 8 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.2, ease: 'easeOut' }}
        >
          <Outlet context={{ user, setUser }} />
        </m.div>
      </main>

      {/* Modal informativo de premios (una vez por sesión, solo si hay pts disponibles) */}
      <PrizeAnnouncementModal
        open={showPrizeModal}
        onClose={handleClosePrizeModal}
        availablePoints={availablePoints}
      />
    </div>
  );
}