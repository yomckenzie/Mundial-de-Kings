import { m } from 'framer-motion';
import { Button } from '@/components/ui/button';
import { Users, RefreshCw, Download } from 'lucide-react';

const itemVariants = {
  hidden: { opacity: 0, y: 16 },
  visible: { opacity: 1, y: 0, transition: { duration: 0.35, ease: [0.25, 0.46, 0.45, 0.94] } }
};

/**
 * Header del ranking: título + contador + acciones admin (refresh, export).
 */
export function RankingHeader({ allUsers, myRank, isAdmin, refreshing, lastSyncedAt, onRefresh, onExport }) {
  return (
    <m.div className="flex items-end justify-between flex-wrap gap-4" variants={itemVariants}>
      <div>
        <div className="flex items-center gap-3 mb-1">
          <div className="w-1.5 h-8 bg-foreground rounded-full" />
          <div>
            <h1 className="font-display text-5xl md:text-6xl tracking-wider leading-none">
              <span className="text-foreground font-black">RANKING</span>
            </h1>
            <p className="text-sm text-muted-foreground mt-2 flex items-center gap-1.5">
              <Users className="w-3.5 h-3.5" />
              <span>{allUsers.length} participante{allUsers.length !== 1 ? 's' : ''}</span>
              {myRank > 0 && (
                <span className="ml-2 text-foreground font-medium">
                  · Tu puesto: #{myRank}
                </span>
              )}
            </p>
          </div>
        </div>
      </div>
      {isAdmin && (
        <div className="flex items-center gap-2">
          <Button onClick={onRefresh} size="sm" variant="outline" disabled={refreshing} className="gap-2">
            <RefreshCw className={`w-4 h-4 ${refreshing ? 'animate-spin' : ''}`} />
            <span className="hidden sm:inline">Actualizar</span>
          </Button>
          <Button onClick={onExport} size="sm" className="gap-2 glow-sm shadow-lg shadow-foreground/10">
            <Download className="w-4 h-4" />
            <span className="hidden sm:inline">Exportar Top 10</span>
          </Button>
        </div>
      )}

      {lastSyncedAt && (
        <p className="w-full text-right text-[11px] text-muted-foreground/60 -mt-1">
          Última sincronización: {lastSyncedAt.toLocaleTimeString('es-PA', { hour: '2-digit', minute: '2-digit', second: '2-digit' })}
        </p>
      )}
    </m.div>
  );
}