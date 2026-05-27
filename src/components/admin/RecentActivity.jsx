import React from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Trophy, UserPlus, ShoppingCart } from 'lucide-react';
import { formatDistanceToNow } from 'date-fns';
import { es } from 'date-fns/locale/es';

function timeAgo(date) {
  return formatDistanceToNow(new Date(date), { addSuffix: true, locale: es });
}

export default function RecentActivity({ predictions, users, redemptions }) {
  const activities = [
    ...predictions.slice(0, 5).map(p => ({
      id: p.id,
      icon: Trophy,
      color: 'text-yellow-500',
      label: `${p.user_email} hizo un pronóstico`,
      time: p.created_date,
    })),
    ...users.slice(0, 5).map(u => ({
      id: u.id,
      icon: UserPlus,
      color: 'text-blue-500',
      label: `${u.email} se registró`,
      time: u.created_date,
    })),
    ...redemptions.slice(0, 5).map(r => ({
      id: r.id,
      icon: ShoppingCart,
      color: 'text-purple-500',
      label: `${r.user_email} canjeó ${r.prize_name}`,
      time: r.created_date,
    })),
  ]
    .filter(a => a.time)
    .sort((a, b) => new Date(b.time) - new Date(a.time))
    .slice(0, 10);

  return (
    <Card>
      <CardHeader className="pb-3">
        <CardTitle className="text-base">Actividad Reciente</CardTitle>
      </CardHeader>
      <CardContent className="p-0">
        <div className="divide-y divide-border">
          {activities.length === 0 && (
            <p className="p-4 text-sm text-muted-foreground">Sin actividad reciente.</p>
          )}
          {activities.map((a) => {
            const Icon = a.icon;
            return (
              <div key={a.id} className="flex items-center gap-3 px-4 py-3">
                <Icon className={`w-4 h-4 shrink-0 ${a.color}`} />
                <p className="text-sm flex-1 truncate">{a.label}</p>
                <span className="text-xs text-muted-foreground whitespace-nowrap">{timeAgo(a.time)}</span>
              </div>
            );
          })}
        </div>
      </CardContent>
    </Card>
  );
}