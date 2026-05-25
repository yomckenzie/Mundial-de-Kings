import React from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid } from 'recharts';

export default function TopUsersChart({ users }) {
  const data = [...users]
    .sort((a, b) => (b.total_points || 0) - (a.total_points || 0))
    .slice(0, 10)
    .map(u => ({
      name: `@${u.instagram || u.email?.split('@')[0]}`,
      puntos: u.total_points || 0,
    }));

  return (
    <Card>
      <CardHeader className="pb-3">
        <CardTitle className="text-base">Top 10 Usuarios por Puntos</CardTitle>
      </CardHeader>
      <CardContent>
        <ResponsiveContainer width="100%" height={220}>
          <BarChart data={data} layout="vertical" margin={{ top: 4, right: 8, left: 40, bottom: 0 }}>
            <CartesianGrid strokeDasharray="3 3" className="stroke-border" />
            <XAxis type="number" tick={{ fontSize: 10 }} allowDecimals={false} />
            <YAxis type="category" dataKey="name" tick={{ fontSize: 10 }} width={70} />
            <Tooltip />
            <Bar dataKey="puntos" fill="hsl(60 100% 50%)" radius={[0, 4, 4, 0]} />
          </BarChart>
        </ResponsiveContainer>
      </CardContent>
    </Card>
  );
}