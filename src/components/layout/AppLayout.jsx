import React, { useState, useEffect } from 'react';
import { Outlet, useNavigate, useLocation } from 'react-router-dom';
import { motion, AnimatePresence } from 'framer-motion';
import { api } from '@/api/client';
import Navbar from './Navbar';
import PanamaClockWidget from '@/components/PanamaClockWidget';

const pageVariants = {
  initial: { opacity: 0, y: 12 },
  animate: { opacity: 1, y: 0, transition: { duration: 0.3, ease: 'easeOut' } },
  exit: { opacity: 0, y: -8, transition: { duration: 0.2, ease: 'easeIn' } },
};

export default function AppLayout() {
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(true);
  const navigate = useNavigate();
  const location = useLocation();

  useEffect(() => {
    const loadUser = async () => {
      try {
        const me = await api.auth.me();
        setUser(me);
        if (me && !me.profile_complete && me.role !== 'admin') {
          navigate('/complete-profile');
        }
      } catch {
        setUser(null);
      }
      setLoading(false);
    };
    loadUser();
  }, []);

  if (loading) {
    return (
      <div className="fixed inset-0 flex items-center justify-center bg-background">
        <div className="flex flex-col items-center gap-3">
          <div className="w-10 h-10 border-[3px] border-muted border-t-primary rounded-full animate-spin" />
          <p className="text-sm text-muted-foreground animate-pulse">Cargando...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background">
      <Navbar user={user} />
      <div className="border-b border-border bg-muted/50 flex justify-center py-1.5">
        <PanamaClockWidget />
      </div>
      <main className="max-w-6xl mx-auto px-4 py-6">
        <AnimatePresence mode="wait">
          <motion.div
            key={location.pathname}
            variants={pageVariants}
            initial="initial"
            animate="animate"
            exit="exit"
          >
            <Outlet context={{ user, setUser }} />
          </motion.div>
        </AnimatePresence>
      </main>
    </div>
  );
}
