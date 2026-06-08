import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Database, ChevronDown, ChevronUp, Globe, Zap, UserCheck, RefreshCw, Wifi } from 'lucide-react';
import { AnimatePresence, m } from 'framer-motion';

const SOURCE_ICONS = {
  'api-football': <Zap className="w-4 h-4" />,
  'football-data': <Globe className="w-4 h-4" />,
  'manual': <UserCheck className="w-4 h-4" />,
};

const SOURCE_COLORS = {
  configured_online: 'bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-400 border-emerald-200 dark:border-emerald-800',
  configured_offline: 'bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400 border-amber-200 dark:border-amber-800',
  not_configured: 'bg-muted text-muted-foreground border-border',
};

export default function DataSourcePanel({ sources, sourcesLoading, syncing, show, onToggle, onSync, onRefresh }) {
  return (
    <Card className="border shadow-sm">
      <CardHeader className="pb-3 cursor-pointer" onClick={onToggle}>
        <div className="flex items-center justify-between">
          <CardTitle className="text-lg flex items-center gap-2">
            <Database className="w-5 h-5" />
            Fuentes de Datos
          </CardTitle>
          <div className="flex items-center gap-2">
            <span className="text-xs text-muted-foreground">
              {sources.find(s => s.online && s.type !== 'siempre') ? 'Automático activo' : 'Solo manual'}
            </span>
            {show ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
          </div>
        </div>
      </CardHeader>
      <AnimatePresence>
        {show && (
          <m.div initial={{ height: 0, opacity: 0 }} animate={{ height: 'auto', opacity: 1 }} exit={{ height: 0, opacity: 0 }} transition={{ duration: 0.2 }}>
            <CardContent className="pt-0 space-y-3">
              {sourcesLoading ? (
                <p className="text-sm text-muted-foreground">Verificando fuentes...</p>
              ) : (
                <>
                  <div className="grid gap-2">
                    {sources.map((source) => {
                      let stateClass = SOURCE_COLORS.not_configured;
                      let stateText = 'No configurado';
                      if (source.type === 'siempre') {
                        stateClass = 'bg-emerald-50 text-emerald-700 dark:bg-emerald-950/30 dark:text-emerald-400 border-emerald-200 dark:border-emerald-800';
                        stateText = 'Disponible';
                      } else if (source.configured && source.online) {
                        stateClass = SOURCE_COLORS.configured_online;
                        stateText = 'Conectado';
                      } else if (source.configured && !source.online) {
                        stateClass = SOURCE_COLORS.configured_offline;
                        stateText = 'Sin conexión';
                      }

                      return (
                        <div key={source.id} className="flex items-center justify-between p-2.5 rounded-lg border bg-card">
                          <div className="flex items-center gap-3">
                            <div className={`p-1.5 rounded-full ${stateClass}`}>
                              {SOURCE_ICONS[source.id] || <Globe className="w-4 h-4" />}
                            </div>
                            <div>
                              <div className="flex items-center gap-2">
                                <span className="font-medium text-sm">{source.name}</span>
                                <Badge variant="outline" className={`text-[10px] px-1.5 py-0 ${stateClass}`}>{stateText}</Badge>
                                {source.type === 'gratis' && <span className="text-[10px] text-emerald-600 dark:text-emerald-400 font-medium">GRATIS</span>}
                                {source.type === 'pago' && <span className="text-[10px] text-amber-600 dark:text-amber-400 font-medium">PAGA</span>}
                              </div>
                              <p className="text-xs text-muted-foreground mt-0.5">{source.desc}</p>
                              {!source.configured && source.type !== 'siempre' && (
                                <p className="text-[10px] text-muted-foreground/60 mt-0.5 font-mono">{source.setup}</p>
                              )}
                            </div>
                          </div>
                        </div>
                      );
                    })}
                  </div>

                  <div className="flex flex-wrap items-center gap-2 pt-1">
                    <Button size="sm" variant="default" onClick={onSync} disabled={syncing} className="gap-2">
                      <RefreshCw className={`w-4 h-4 ${syncing ? 'animate-spin' : ''}`} />
                      {syncing ? 'Sincronizando...' : 'Sincronizar resultados'}
                    </Button>
                    <Button size="sm" variant="outline" onClick={onRefresh} disabled={sourcesLoading} className="gap-2">
                      <Wifi className="w-4 h-4" /> Verificar fuentes
                    </Button>
                  </div>
                </>
              )}
            </CardContent>
          </m.div>
        )}
      </AnimatePresence>
    </Card>
  );
}
