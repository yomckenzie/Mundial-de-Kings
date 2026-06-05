import React, { useState, useEffect, useCallback } from 'react';
import { Outlet, useNavigate, useLocation } from 'react-router-dom';
import { m } from 'framer-motion';
import { api } from '@/api/client';
import Navbar from './Navbar';
import PanamaClockWidget from '@/components/PanamaClockWidget';

export default function AppLayout() {
  const navigate = useNavigate();
  const location = useLocation();
  const [authState, setAuthState] = useState({ user: null, loading: true });
  const updateUser = useCallback((u) => setAuthState(prev => ({ ...prev, user: u })), []);

  useEffect(() => {
    let cancelled = false;
    api.auth.me().then(me => {
      if (cancelled) return;
      setAuthState({ user: me, loading: false });
      if (me && !me.profile_complete && me.role !== 'admin') {
        navigate('/complete-profile');
      }
    }).catch(() => {
      if (!cancelled) setAuthState({ user: null, loading: false });
    });
    return () => { cancelled = true; };
  }, [navigate]);

  if (authState.loading) {
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
      <Navbar user={authState.user} />
      <div className="border-b border-border bg-muted/50 flex justify-center py-1.5">
        <PanamaClockWidget />
      </div>
      <main className="max-w-6xl mx-auto px-4 py-6">
        <m.div
          key={location.pathname}
          initial={{ opacity: 0, y: 8 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.2, ease: 'easeOut' }}
        >
          <Outlet context={{ user: authState.user, setUser: updateUser }} />
        </m.div>
      </main>
    </div>
  );
}
