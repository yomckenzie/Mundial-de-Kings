import React from 'react';
import { Link, Outlet, useLocation, useOutletContext } from 'react-router-dom';
import { Button } from '@/components/ui/button';
import { Users, Target, Trophy, Gift, ShoppingCart, LayoutDashboard, HeadphonesIcon } from 'lucide-react';

const tabs = [
  { to: '/admin', label: 'Dashboard', icon: LayoutDashboard },
  { to: '/admin/users', label: 'Usuarios', icon: Users },
  { to: '/admin/matches', label: 'Partidos', icon: Target },
  { to: '/admin/predictions', label: 'Pronósticos', icon: Trophy },
  { to: '/admin/prizes', label: 'Premios', icon: Gift },
  { to: '/admin/redemptions', label: 'Canjes', icon: ShoppingCart },
  { to: '/admin/support', label: 'Soporte', icon: HeadphonesIcon },
];

export default function AdminLayout() {
  const location = useLocation();
  const context = useOutletContext();

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
          <Link key={t.to} to={t.to}>
            <Button
              variant={location.pathname === t.to ? 'default' : 'outline'}
              size="sm"
              className="gap-1.5"
            >
              <t.icon className="w-4 h-4" />
              {t.label}
            </Button>
          </Link>
        ))}
      </div>
      <Outlet context={context} />
    </div>
  );
}