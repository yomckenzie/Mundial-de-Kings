import React, { useState, useEffect } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';

export default function MatchParticipationChart({ matches, predictions }) {
  const [charts, setCharts] = useState(null);

  useEffect(() => {
    import('recharts').then(mod => setCharts(mod));
  }, []);

  if (!charts) {
    return (
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base">Participación por Partido</CardTitle>
        </CardHeader>
        <CardContent className="h-[260px] flex items-center justify-center text-muted-foreground text-sm">
          Cargando gráfica…
        </CardContent>
      </Card>
    );
  }

  const { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid } = charts;
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