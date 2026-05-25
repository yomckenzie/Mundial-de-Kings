import React from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid } from 'recharts';

export default function MatchParticipationChart({ matches, predictions }) {
  const data = matches.slice(0, 10).map(m => {
    const count = predictions.filter(p => p.match_id === m.id).length;
    return {
      name: `${m.team1} vs ${m.team2}`.slice(0, 16),
      pronósticos: count,
    };
  });

  return (
    <Card>
      <CardHeader className="pb-3">
        <CardTitle className="text-base">Participación por Partido</CardTitle>
      </CardHeader>
      <CardContent>
        <ResponsiveContainer width="100%" height={220}>
          <BarChart data={data} margin={{ top: 4, right: 8, left: -16, bottom: 0 }}>
            <CartesianGrid strokeDasharray="3 3" className="stroke-border" />
            <XAxis dataKey="name" tick={{ fontSize: 10 }} />
            <YAxis tick={{ fontSize: 10 }} allowDecimals={false} />
            <Tooltip />
            <Bar dataKey="pronósticos" fill="hsl(var(--primary))" radius={[4, 4, 0, 0]} />
          </BarChart>
        </ResponsiveContainer>
      </CardContent>
    </Card>
  );
}