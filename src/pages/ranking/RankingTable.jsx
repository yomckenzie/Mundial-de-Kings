import { m } from 'framer-motion';
import { Crown, Medal, Award, Target, Zap } from 'lucide-react';

const containerVariants = {
  hidden: { opacity: 0 },
  visible: {
    opacity: 1,
    transition: { staggerChildren: 0.04, delayChildren: 0.1 }
  }
};

const itemVariants = {
  hidden: { opacity: 0, y: 16 },
  visible: { opacity: 1, y: 0, transition: { duration: 0.35, ease: [0.25, 0.46, 0.45, 0.94] } }
};

function getRankBadge(pos) {
  if (pos === 1) return { icon: Crown, color: 'from-foreground to-foreground', bg: 'bg-muted border-muted-foreground/30', text: 'text-foreground' };
  if (pos === 2) return { icon: Medal, color: 'from-foreground to-foreground', bg: 'bg-muted border-muted-foreground/30', text: 'text-foreground' };
  if (pos === 3) return { icon: Award, color: 'from-foreground to-foreground', bg: 'bg-muted border-muted-foreground/30', text: 'text-foreground' };
  if (pos <= 10) return { icon: null, color: 'from-foreground to-foreground', bg: 'bg-muted/50 border-border/50', text: 'text-muted-foreground' };
  return { icon: null, color: null, bg: 'bg-transparent border-transparent', text: 'text-muted-foreground' };
}

function getRowStyle(pos) {
  const base = 'transition-all duration-200 hover:bg-muted/40 hover:scale-[1.002]';
  if (pos <= 3) return `${base} bg-gradient-to-r from-foreground/[0.06] via-foreground/[0.03] to-transparent border-l-[3px] border-l-foreground`;
  return `${base} border-l-[3px] border-l-transparent hover:border-l-border`;
}

export default function RankingTable({ pagedUsers, page, pageSize, user, isFiltering = false, emptyMessage }) {
  if (pagedUsers.length === 0) {
    return (
      <m.div key="empty" className="py-16 text-center" initial={{ opacity: 0 }} animate={{ opacity: 1 }}>
        <div className="w-16 h-16 rounded-2xl bg-muted/30 flex items-center justify-center mx-auto mb-4">
          <Target className="w-8 h-8 text-muted-foreground/40" />
        </div>
        {emptyMessage ? (
          <p className="text-muted-foreground font-medium">{emptyMessage}</p>
        ) : isFiltering ? (
          <>
            <p className="text-muted-foreground font-medium">No se encontró ningún usuario con ese criterio.</p>
            <p className="text-sm text-muted-foreground/60 mt-1">Probá con otro Instagram o email.</p>
          </>
        ) : (
          <>
            <p className="text-muted-foreground font-medium">No hay usuarios registrados aún.</p>
            <p className="text-sm text-muted-foreground/60 mt-1">¡Sé el primero en participar!</p>
          </>
        )}
      </m.div>
    );
  }

  return (
    <m.div key="list" className="divide-y divide-border/40" variants={containerVariants} initial="hidden" animate="visible">
      <div className="hidden md:grid grid-cols-12 px-5 py-3 text-[11px] font-bold text-muted-foreground uppercase tracking-[0.12em] bg-muted/20">
        <div className="col-span-1">#</div>
        <div className="col-span-7">Usuario</div>
        <div className="col-span-2 text-right">Puntos</div>
        <div className="col-span-2 text-right">Diferencia</div>
      </div>

      {pagedUsers.map((u, i) => {
        // u.rank = posición real en el ranking completo (se mantiene al filtrar).
        // Fallback al cálculo por página si no viene rank.
        const pos = u.rank ?? (page * pageSize + i + 1);
        const isMe = u.email === user?.email;
        const gap = u.gapToPrev > 0 ? u.gapToPrev : null;
        const badge = getRankBadge(pos);
        const RankIcon = badge.icon;

        return (
          <m.div
            key={u.id}
            custom={i}
            variants={itemVariants}
            layout
            className={`${getRowStyle(pos)} ${isMe ? 'bg-primary/[0.04] border-l-primary border-l-[3px]' : ''}`}
          >
            <div className="flex items-center justify-between md:hidden px-4 py-3">
              <div className="flex items-center gap-3 min-w-0 flex-1">
                <div className={`w-8 h-8 rounded-full flex items-center justify-center shrink-0 ${pos <= 10 ? badge.bg : ''} ${pos <= 3 ? 'border-2 ' + badge.bg : ''}`}>
                  {RankIcon ? (
                    <RankIcon className={`w-4 h-4 ${badge.text}`} />
                  ) : (
                    <span className={`text-xs font-bold ${badge.text}`}>{pos}</span>
                  )}
                </div>
                <div className="min-w-0">
                  <p className="font-semibold text-sm truncate">
                    @{u.instagram}
                    {isMe && <span className="text-foreground text-xs ml-1.5 font-bold">(Tú)</span>}
                  </p>
                  {u.full_name && <p className="text-[11px] text-muted-foreground truncate">{u.full_name}</p>}
                </div>
              </div>
              <div className="text-right shrink-0 ml-2">
                <p className="font-bold text-sm">{u.prediction_points || 0}</p>
                {gap && <p className="text-[10px] text-muted-foreground/60">-{gap}</p>}
              </div>
            </div>

            <div className="hidden md:grid grid-cols-12 px-5 py-3.5 items-center">
              <div className="col-span-1 flex items-center">
                <div className={`w-9 h-9 rounded-full flex items-center justify-center ${pos <= 10 ? badge.bg : ''} ${pos <= 3 ? 'border-2 ' + badge.bg : ''}`}>
                  {RankIcon ? (
                    <RankIcon className={`w-4 h-4 ${badge.text}`} />
                  ) : (
                    <span className={`text-xs font-bold ${badge.text}`}>{pos}</span>
                  )}
                </div>
              </div>
              <div className="col-span-7">
                <div className="flex items-center gap-2">
                  <p className="font-semibold text-sm truncate">@{u.instagram}</p>
                  {isMe && <span className="text-[10px] font-bold text-foreground uppercase tracking-wider px-1.5 py-0.5 rounded-md bg-muted">Tú</span>}
                </div>
                {u.full_name && <p className="text-xs text-muted-foreground/70 truncate">{u.full_name}</p>}
              </div>
              <div className="col-span-2 text-right">
                <p className="font-bold text-base tabular-nums">{u.prediction_points || 0}</p>
              </div>
              <div className="col-span-2 text-right">
                {gap ? (
                  <div className="inline-flex items-center gap-1 text-xs text-muted-foreground/50">
                    <Zap className="w-3 h-3" />
                    <span className="tabular-nums">{gap}</span>
                  </div>
                ) : pos === 1 ? (
                  <div className="inline-flex items-center gap-1 text-xs text-muted-foreground/60">
                    <Crown className="w-3 h-3" />
                    <span>LÍDER</span>
                  </div>
                ) : null}
              </div>
            </div>
          </m.div>
        );
      })}
    </m.div>
  );
}
