import { m } from 'framer-motion';
import { Card, CardContent } from '@/components/ui/card';
import { Target, CheckCircle2, Trophy } from 'lucide-react';

const STAT_CARD_GRADIENTS = { blue: 'from-foreground to-foreground', emerald: 'from-foreground to-foreground', amber: 'from-foreground to-foreground' };
const STAT_CARD_TEXT = { blue: 'text-foreground', emerald: 'text-foreground', amber: 'text-foreground' };

function StatCard({ icon: Icon, value, label, color, delay = 0 }) {
  const gradient = STAT_CARD_GRADIENTS[color] || 'from-foreground to-foreground';
  const textColor = STAT_CARD_TEXT[color] || 'text-foreground';
  return (
    <m.div
      initial={{ opacity: 0, y: 12, scale: 0.95 }}
      animate={{ opacity: 1, y: 0, scale: 1 }}
      transition={{ delay, duration: 0.35, ease: 'easeOut' }}
    >
      <Card className="card-hover overflow-hidden">
        <div className={`h-1 bg-gradient-to-r ${gradient}`} />
        <CardContent className="p-4 text-center">
          <Icon className={`w-6 h-6 mx-auto mb-1.5 ${textColor}`} />
          <p className="text-2xl font-black">{value}</p>
          <p className="text-xs text-muted-foreground mt-0.5">{label}</p>
        </CardContent>
      </Card>
    </m.div>
  );
}

export default function ProfileStats({ predictionsCount, correctCount, totalPoints }) {
  return (
    <m.div className="grid grid-cols-3 gap-3" variants={{ hidden: { opacity: 0 }, visible: { opacity: 1, transition: { staggerChildren: 0.06 } } }}>
      <StatCard icon={Target} value={predictionsCount} label="Pronósticos" color="blue" delay={0.1} />
      <StatCard icon={CheckCircle2} value={correctCount} label="Aciertos" color="emerald" delay={0.15} />
      <StatCard icon={Trophy} value={totalPoints} label="Puntos ganados" color="amber" delay={0.2} />
    </m.div>
  );
}
