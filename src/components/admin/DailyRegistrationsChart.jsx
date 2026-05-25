import React from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { LineChart, Line, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid } from 'recharts';
import { format, subDays } from 'date-fns';
import { es } from 'date-fns/locale';

export default function DailyRegistrationsChart({ users }) {
  // Last 14 days
  const days = Array.from({ length: 14 }, (_, i) => {
    const d = subDays(new Date(), 13 - i);
    return format(d, 'yyyy-MM-dd');
  });

  const data = days.map(day => ({
    day: format(new Date(day), 'dd/MM', { locale: es }),
    registros: users.filter(u => u.created_date?.slice(0, 10) === day).length,
  }));

  return (
    <Card>
      <CardHeader className="pb-3">
        <CardTitle className="text-base">Registros por Día (últimos 14 días)</CardTitle>
      </CardHeader>
      <CardContent>
        <ResponsiveContainer width="100%" height={220}>
          <LineChart data={data} margin={{ top: 4, right: 8, left: -16, bottom: 0 }}>
            <CartesianGrid strokeDasharray="3 3" className="stroke-border" />
            <XAxis dataKey="day" tick={{ fontSize: 10 }} />
            <YAxis tick={{ fontSize: 10 }} allowDecimals={false} />
            <Tooltip />
            <Line type="monotone" dataKey="registros" stroke="hsl(var(--primary))" strokeWidth={2} dot={{ r: 3 }} />
          </LineChart>
        </ResponsiveContainer>
      </CardContent>
    </Card>
  );
}