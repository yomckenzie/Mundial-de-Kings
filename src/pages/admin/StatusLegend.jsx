import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';

const ITEMS = [
  { status: 'Pendiente', color: 'bg-muted text-muted-foreground', hint: 'Partido creado pero aún no abierto. Oculto para usuarios.' },
  { status: 'Abierto',   color: 'bg-accent text-accent-foreground', hint: 'Apuestas abiertas. Los usuarios pueden enviar pronósticos.' },
  { status: 'En Vivo',   color: 'bg-red-600 text-white', hint: 'Partido en curso. Pronósticos cerrados, marcador visible.' },
  { status: 'Cerrado',   color: 'bg-secondary text-secondary-foreground', hint: 'Terminado sin resultado publicado. Aparece en "CERRADOS".' },
  { status: 'Finalizado', color: 'bg-muted text-muted-foreground', hint: 'Resultado publicado. Predicciones evaluadas y puntos asignados.' },
];

export default function StatusLegend() {
  return (
    <Card className="border border-border/50 bg-muted/20">
      <CardContent className="p-3">
        <p className="text-xs font-medium text-muted-foreground mb-2">Estados de partido:</p>
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-2 text-xs">
          {ITEMS.map(({ status, color, hint }) => (
            <div key={status} className="flex items-start gap-1.5 cursor-help" title={hint}>
              <Badge className={`${color} border-0 px-2 py-0.5 text-[10px] shrink-0`}>{status}</Badge>
              <span className="text-muted-foreground/70 leading-tight">{hint}</span>
            </div>
          ))}
        </div>
        <p className="text-[10px] text-muted-foreground/70 mt-2 italic">
          Transiciones válidas: Pendiente→Abierto→En Vivo→Finalizado. Cerrado es estado alternativo para partidos sin resultado.
        </p>
      </CardContent>
    </Card>
  );
}
