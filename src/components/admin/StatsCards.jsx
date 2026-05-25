import React from 'react';
import { Card, CardContent } from '@/components/ui/card';
import { Users, Target, Trophy, ShoppingCart } from 'lucide-react';

const cards = [
  { label: 'Usuarios', key: 'users', icon: Users, color: 'text-blue-500' },
  { label: 'Partidos', key: 'matches', icon: Target, color: 'text-green-500' },
  { label: 'Pronósticos', key: 'predictions', icon: Trophy, color: 'text-yellow-500' },
  { label: 'Canjes', key: 'redemptions', icon: ShoppingCart, color: 'text-purple-500' },
];

export default function StatsCards({ stats }) {
  return (
    <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
      {cards.map(({ label, key, icon: Icon, color }) => (
        <Card key={key}>
          <CardContent className="p-4 flex items-center gap-3">
            <Icon className={`w-8 h-8 ${color}`} />
            <div>
              <p className="text-2xl font-bold">{stats[key] ?? '—'}</p>
              <p className="text-xs text-muted-foreground">{label}</p>
            </div>
          </CardContent>
        </Card>
      ))}
    </div>
  );
}