import React, { useState, useEffect } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { format, subDays } from 'date-fns';
import { es } from 'date-fns/locale/es';

export default function DailyWinnersChart({ predictions }) {
  const [charts, setCharts] = useState(null);

  useEffect(() => {
    import('recharts').then(mod => setCharts(mod));
  }, []);

  if (!charts) {
    return (
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base">Ganadores por Día (últimos 14 días)</CardTitle>
        </CardHeader>
        <CardContent className="h-[260px] flex items-center justify-center text-muted-foreground text-sm">
          Cargando gráfica…
        </CardContent>
      </Card>
    );
  }

  const { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid } = charts;

  // Winners = predictions with points_earned > 0
  const days = Array.from({ length: 14 }, (_, i) => {
    const d = subDays(new Date(), 13 - i);
    return format(d, 'yyyy-MM-dd');
  });

  const data = days.map(day => ({
    day: format(new Date(day), 'dd/MM', { locale: es }),
    ganadores: predictions.filter(
      p => p.created_date?.slice(0, 10) === day && p.points_earned > 0
    ).length,
  }));

  return (
    <Card>
      <CardHeader className="pb-3">
        <CardTitle className="text-base">Ganadores por Día (últimos 14 días)</CardTitle>
      </CardHeader>
      <CardContent>
        <ResponsiveContainer width="100%" height={220}>
          <BarChart data={data} margin={{ top: 4, right: 8, left: -16, bottom: 0 }}>
            <CartesianGrid strokeDasharray="3 3" className="stroke-border" />
            <XAxis dataKey="day" tick={{ fontSize: 10 }} />
            <YAxis tick={{ fontSize: 10 }} allowDecimals={false} />
            <Tooltip />
            <Bar dataKey="ganadores" fill="hsl(60 100% 50%)" radius={[4, 4, 0, 0]} />
          </BarChart>
        </ResponsiveContainer>
      </CardContent>
    </Card>
  );
}