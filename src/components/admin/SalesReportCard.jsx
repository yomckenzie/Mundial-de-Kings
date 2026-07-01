import { useState, useMemo } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { ShoppingBag, TrendingUp, Users, Gift, Crown } from 'lucide-react';
import {
  PERIODS,
  getSalesSummary,
  getTopPrizes,
  getTopUsers,
  getDailySales,
} from '@/lib/salesReport';

/**
 * Mini reporte de ventas para el dashboard de admin.
 * Selector de período + 4 KPIs + top 5 premios + top 5 usuarios + sparkline diaria.
 *
 * Props:
 *   - redemptions: array de canjes (formato db.redemptions)
 *   - usersByEmail: mapa { email -> user } opcional para mostrar nombre en el top
 */
export default function SalesReportCard({ redemptions = [], usersByEmail = {} }) {
  const [period, setPeriod] = useState('30d');

  const summary = useMemo(() => getSalesSummary(redemptions, period), [redemptions, period]);
  const topPrizes = useMemo(() => getTopPrizes(redemptions, period, 5), [redemptions, period]);
  const topUsers = useMemo(() => getTopUsers(redemptions, period, 5), [redemptions, period]);
  const daily = useMemo(() => getDailySales(redemptions, period), [redemptions, period]);

  const maxCount = topPrizes[0]?.count || 1;
  const maxDayCount = daily.reduce((m, d) => Math.max(m, d.count), 0);

  return (
    <Card>
      <CardHeader className="pb-2 flex flex-row items-center justify-between gap-2 flex-wrap">
        <CardTitle className="text-base flex items-center gap-2">
          <ShoppingBag className="w-4 h-4" />
          Reporte de canjes
        </CardTitle>
        {/* Selector de período */}
        <div className="flex gap-1 text-xs">
          {PERIODS.map((p) => (
            <button
              key={p.key}
              type="button"
              onClick={() => setPeriod(p.key)}
              className={`px-2 py-1 rounded-md border transition-colors ${
                period === p.key
                  ? 'bg-primary text-primary-foreground border-primary'
                  : 'bg-transparent text-muted-foreground hover:bg-muted'
              }`}
            >
              {p.label}
            </button>
          ))}
        </div>
      </CardHeader>
      <CardContent className="space-y-4">
        {/* 4 KPIs */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-2">
          <Kpi icon={ShoppingBag} value={summary.count} label="Canjes" color="text-primary" />
          <Kpi icon={TrendingUp} value={summary.totalPoints.toLocaleString('es')} label="Puntos canjeados" color="text-amber-600" />
          <Kpi icon={Users} value={summary.uniqueUsers} label="Usuarios únicos" color="text-indigo-600" />
          <Kpi icon={Gift} value={summary.uniquePrizes} label="Premios vendidos" color="text-pink-600" />
        </div>

        {/* Sparkline diaria (barras) */}
        {daily.length > 0 && (
          <div>
            <p className="text-xs uppercase tracking-wide text-muted-foreground mb-2">Canjes por día</p>
            <div className="flex items-end gap-0.5 h-12">
              {daily.map((d) => {
                const h = maxDayCount > 0 ? Math.max(2, Math.round((d.count / maxDayCount) * 100)) : 2;
                return (
                  <div
                    key={d.date}
                    className="flex-1 bg-primary/70 hover:bg-primary rounded-sm transition-colors"
                    style={{ height: `${h}%` }}
                    title={`${d.date}: ${d.count} canjes · ${d.points} pts`}
                  />
                );
              })}
            </div>
            <div className="flex justify-between text-[10px] text-muted-foreground mt-1">
              <span>{daily[0]?.date}</span>
              <span>{daily[daily.length - 1]?.date}</span>
            </div>
          </div>
        )}

        <div className="grid md:grid-cols-2 gap-4">
          {/* Top premios */}
          <div>
            <p className="text-xs uppercase tracking-wide text-muted-foreground mb-2 flex items-center gap-1">
              <Gift className="w-3 h-3" /> Top premios
            </p>
            {topPrizes.length === 0 ? (
              <p className="text-sm text-muted-foreground italic">Sin canjes en este período.</p>
            ) : (
              <ul className="space-y-1.5">
                {topPrizes.map((p, i) => (
                  <li key={p.prizeId} className="space-y-0.5">
                    <div className="flex items-center justify-between gap-2 text-xs">
                      <span className="truncate flex-1">
                        <span className="text-muted-foreground mr-1">#{i + 1}</span>
                        {p.prizeName}
                      </span>
                      <span className="font-bold whitespace-nowrap">
                        {p.count}× · {p.points.toLocaleString('es')} pts
                      </span>
                    </div>
                    <div className="h-1.5 bg-muted rounded overflow-hidden">
                      <div
                        className="h-full bg-primary/80"
                        style={{ width: `${Math.max(4, (p.count / maxCount) * 100)}%` }}
                      />
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </div>

          {/* Top usuarios */}
          <div>
            <p className="text-xs uppercase tracking-wide text-muted-foreground mb-2 flex items-center gap-1">
              <Crown className="w-3 h-3" /> Top usuarios
            </p>
            {topUsers.length === 0 ? (
              <p className="text-sm text-muted-foreground italic">Sin canjes en este período.</p>
            ) : (
              <ul className="space-y-1.5">
                {topUsers.map((u, i) => {
                  const user = usersByEmail[u.userEmail];
                  const name = user?.full_name || user?.email?.split('@')[0] || u.userEmail;
                  return (
                    <li key={u.userEmail} className="flex items-center justify-between gap-2 text-xs">
                      <span className="truncate flex-1">
                        <span className="text-muted-foreground mr-1">#{i + 1}</span>
                        {name}
                      </span>
                      <Badge variant="outline" className="text-[10px] px-1.5 py-0">
                        {u.count}× · {u.points.toLocaleString('es')} pts
                      </Badge>
                    </li>
                  );
                })}
              </ul>
            )}
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

function Kpi({ icon: Icon, value, label, color }) {
  return (
    <div className="rounded-md border border-border bg-card p-3 flex items-center gap-3">
      <Icon className={`w-5 h-5 shrink-0 ${color}`} />
      <div className="min-w-0">
        <p className="text-xl font-black leading-tight">{value}</p>
        <p className="text-[10px] uppercase tracking-wide text-muted-foreground truncate">{label}</p>
      </div>
    </div>
  );
}