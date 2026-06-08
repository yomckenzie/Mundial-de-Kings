import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';

export default function StatusLegend() {
  return (
    <Card className="border border-border/50 bg-muted/20">
      <CardContent className="p-3">
        <p className="text-xs font-medium text-muted-foreground mb-2">Estados de partido:</p>
        <div className="grid grid-cols-2 sm:grid-cols-5 gap-2 text-xs">
          <div className="flex items-center gap-1.5">
            <Badge className="bg-muted text-muted-foreground border-0 px-2 py-0.5 text-[10px]">Pendiente</Badge>
            <span className="text-muted-foreground/70">Creado, aún no abierto</span>
          </div>
          <div className="flex items-center gap-1.5">
            <Badge className="bg-accent text-accent-foreground border-0 px-2 py-0.5 text-[10px]">Abierto</Badge>
            <span className="text-muted-foreground/70">Apuestas abiertas</span>
          </div>
          <div className="flex items-center gap-1.5">
            <Badge className="bg-red-600 text-white border-0 px-2 py-0.5 text-[10px]">En Vivo</Badge>
            <span className="text-muted-foreground/70">Jugándose</span>
          </div>
          <div className="flex items-center gap-1.5">
            <Badge className="bg-secondary text-secondary-foreground border-0 px-2 py-0.5 text-[10px]">Cerrado</Badge>
            <span className="text-muted-foreground/70">Terminado, sin resultado</span>
          </div>
          <div className="flex items-center gap-1.5">
            <Badge className="bg-muted text-muted-foreground border-0 px-2 py-0.5 text-[10px]">Finalizado</Badge>
            <span className="text-muted-foreground/70">Resultado publicado</span>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
