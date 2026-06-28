import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Gift, Trash2 } from 'lucide-react';

export default function UserCard({ user, aciertosMap, canjesMap, referredCountMap, breakdownMap, onGrantPoints, onDelete }) {
  const br = breakdownMap?.[user.email];
  const hasBreakdown = br && (br.v1Total > 0 || br.v2Total > 0);
  return (
    <Card>
      <CardContent className="p-3 text-sm">
        <div className="grid grid-cols-2 md:grid-cols-4 gap-2">
          <div>
            <p className="text-muted-foreground text-xs">Nombre</p>
            <p className="font-medium">{user.full_name}</p>
          </div>
          <div>
            <p className="text-muted-foreground text-xs">Cédula</p>
            <p>{user.cedula}</p>
          </div>
          <div>
            <p className="text-muted-foreground text-xs">Instagram</p>
            <p>@{user.instagram}</p>
          </div>
          <div>
            <p className="text-muted-foreground text-xs">Puntos</p>
            <p className="font-bold">{user.total_points || 0}</p>
            <p className="text-xs text-muted-foreground">🎯 {user.prediction_points || 0} · 🎁 {user.bonus_points || 0}</p>
          </div>
        </div>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-2 mt-2">
          <div>
            <p className="text-muted-foreground text-xs">Correo</p>
            <p>{user.email}</p>
          </div>
          <div>
            <p className="text-muted-foreground text-xs">TikTok</p>
            <p>@{user.tiktok}</p>
          </div>
          <div>
            <p className="text-muted-foreground text-xs">Aciertos</p>
            <p className="font-medium">{aciertosMap[user.email] || 0}</p>
          </div>
          <div>
            <p className="text-muted-foreground text-xs">Canjes</p>
            <p className="font-medium">{canjesMap[user.email] || 0}</p>
          </div>
        </div>

        {/* Sub-desglose v1 vs v2 (solo si el usuario tiene pronósticos scored) */}
        {hasBreakdown && (
          <div className="mt-2 pt-2 border-t border-border/50">
            <div className="flex items-center justify-between text-xs mb-1.5">
              <span className="text-muted-foreground font-medium">Desglose por modelo</span>
              <span className="font-semibold tabular-nums">{user.prediction_points || 0} pts total</span>
            </div>
            {br.v1Total > 0 && (
              <div className="flex items-center justify-between text-xs py-0.5 px-1.5 rounded bg-muted/30">
                <span className="text-muted-foreground">v1 (pre-28 jun, marcador exacto 100 pts)</span>
                <span className="font-semibold tabular-nums">{br.v1Points} pts · {br.v1Aciertos}/{br.v1Total}</span>
              </div>
            )}
            {br.v2Total > 0 && (
              <>
                <div className="flex items-center justify-between text-xs py-0.5 px-1.5 rounded bg-muted/30 mt-1">
                  <span className="text-foreground font-medium">v2 (≥ 28 jun, 3 picks · gate del ganador)</span>
                  <span className="font-semibold tabular-nums">{br.v2Points} pts</span>
                </div>
                <div className="grid grid-cols-3 gap-1 mt-1">
                  <div className="flex flex-col items-center py-0.5 px-1 rounded bg-primary/5 text-center">
                    <span className="text-[10px] text-muted-foreground leading-tight">Ganador</span>
                    <span className="font-semibold tabular-nums text-foreground">{br.v2Winner}/{br.v2Total}</span>
                  </div>
                  <div className="flex flex-col items-center py-0.5 px-1 rounded bg-primary/5 text-center">
                    <span className="text-[10px] text-muted-foreground leading-tight">Método</span>
                    <span className="font-semibold tabular-nums text-foreground">{br.v2Method}/{br.v2Total}</span>
                  </div>
                  <div className="flex flex-col items-center py-0.5 px-1 rounded bg-primary/5 text-center">
                    <span className="text-[10px] text-muted-foreground leading-tight">Marcador</span>
                    <span className="font-semibold tabular-nums text-foreground">{br.v2Score}/{br.v2Total}</span>
                  </div>
                </div>
              </>
            )}
          </div>
        )}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-2 mt-1">
          <div>
            <p className="text-muted-foreground text-xs">Código referido</p>
            <p className="font-mono text-xs">{user.referral_code || '—'}</p>
          </div>
          <div>
            <p className="text-muted-foreground text-xs">Referidos</p>
            <p className="font-medium">{referredCountMap[user.email] || 0}</p>
          </div>
          <div>
            <p className="text-muted-foreground text-xs">Puntos por referidos</p>
            <p className="font-medium">{user.referral_points || 0}</p>
          </div>
          <div>
            <p className="text-muted-foreground text-xs">
              Bono por referido
              {user.referral_bonus_amount != null && user.referral_bonus_amount !== 10 && (
                <span className="text-amber-500 ml-1">⭐</span>
              )}
            </p>
            <p className="font-medium">{user.referral_bonus_amount != null ? `${user.referral_bonus_amount} pts` : '10 pts (estándar)'}</p>
          </div>
          <div>
            <p className="text-muted-foreground text-xs">Referido por</p>
            <p className="font-mono text-xs truncate" title={user.referred_by || ''}>{user.referred_by || '—'}</p>
          </div>
        </div>
        <div className="mt-1 flex items-center justify-between">
          <p className="text-muted-foreground text-xs">Registro: {user.created_date ? new Date(user.created_date).toLocaleDateString('es-PA') : '-'}</p>
          <div className="flex gap-1.5">
            <Button size="sm" variant="outline" className="gap-1.5 h-7 text-xs" onClick={() => onGrantPoints(user)}>
              <Gift className="w-3 h-3" /> Otorgar puntos
            </Button>
            {user.role !== 'admin' && (
              <Button size="sm" variant="destructive" className="gap-1.5 h-7 text-xs" onClick={() => onDelete(user)}>
                <Trash2 className="w-3 h-3" /> Eliminar
              </Button>
            )}
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
