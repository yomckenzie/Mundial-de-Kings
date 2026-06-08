import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Gift, Trash2 } from 'lucide-react';

export default function UserCard({ user, aciertosMap, canjesMap, referredCountMap, onGrantPoints, onDelete }) {
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
