import React from 'react';
import { Link, Outlet, useLocation, useOutletContext } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { Button } from '@/components/ui/button';
import { Users, Target, Trophy, Gift, ShoppingCart, LayoutDashboard, HeadphonesIcon, ShieldAlert } from 'lucide-react';
import { db } from '@/lib/db';

const tabs = [
  { to: '/admin', label: 'Dashboard', icon: LayoutDashboard },
  { to: '/admin/users', label: 'Usuarios', icon: Users },
  { to: '/admin/matches', label: 'Partidos', icon: Target },
  { to: '/admin/predictions', label: 'Pronósticos', icon: Trophy },
  { to: '/admin/prizes', label: 'Premios', icon: Gift },
  { to: '/admin/redemptions', label: 'Canjes', icon: ShoppingCart },
  { to: '/admin/support', label: 'Soporte', icon: HeadphonesIcon },
  { to: '/admin/audit-log', label: 'Auditoría', icon: ShieldAlert },
];

export default function AdminLayout() {
  const location = useLocation();
  const context = useOutletContext();

  const { data: unreadSupport = 0 } = useQuery({
    queryKey: ['admin-layout-unread'],
    queryFn: () => db.supportTickets.adminUnreadCount(),
    refetchInterval: 20000,
  });

  const { data: pendingRedemptions = 0 } = useQuery({
    queryKey: ['admin-layout-pending-redemptions'],
    queryFn: () => {
      const d = db._init().redemptions || [];
      return d.filter(r => r.status === 'pending').length;
    },
    refetchInterval: 20000,
  });

  if (context?.user?.role !== 'admin') {
    return (
      <div className="text-center py-12">
        <p className="text-destructive font-semibold">No tienes permiso para acceder a esta sección.</p>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <h1 className="font-display text-4xl tracking-wide">PANEL ADMIN</h1>
      <div className="flex flex-wrap gap-2">
        {tabs.map(t => (
          <Link key={t.to} to={t.to} className="relative">
            <Button
              variant={location.pathname === t.to ? 'default' : 'outline'}
              size="sm"
              className="gap-1.5"
            >
              <t.icon className="w-4 h-4" />
              {t.label}
              {t.to === '/admin/support' && unreadSupport > 0 && (
                <span className="absolute -top-1.5 -right-1.5 w-[18px] h-[18px] rounded-full bg-destructive text-[9px] font-bold text-destructive-foreground flex items-center justify-center shadow-lg">
                  {unreadSupport > 9 ? '9+' : unreadSupport}
                </span>
              )}
              {t.to === '/admin/redemptions' && pendingRedemptions > 0 && (
                <span className="absolute -top-1.5 -right-1.5 w-[18px] h-[18px] rounded-full bg-amber-500 text-[9px] font-bold text-white flex items-center justify-center shadow-lg">
                  {pendingRedemptions > 9 ? '9+' : pendingRedemptions}
                </span>
              )}
            </Button>
          </Link>
        ))}
      </div>
      <Outlet context={context} />
    </div>
  );
}