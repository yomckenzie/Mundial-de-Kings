import { m } from 'framer-motion';
import { Card, CardContent } from '@/components/ui/card';
import { Crown } from 'lucide-react';

const podiumVariants = {
  hidden: { opacity: 0, scale: 0.8, y: 20 },
  visible: (i) => ({
    opacity: 1, scale: 1, y: 0,
    transition: { delay: 0.15 + i * 0.15, duration: 0.45, ease: 'backOut' }
  }),
  hover: { y: -6, transition: { duration: 0.25 } }
};

export default function RankingPodium({ top3 }) {
  if (top3.length < 3) return null;

  const items = [
    { user: top3[1], pos: 2, label: '2º' },
    { user: top3[0], pos: 1, label: '1º' },
    { user: top3[2], pos: 3, label: '3º' },
  ];

  return (
    <m.div className="grid grid-cols-3 gap-3 md:gap-5">
      {items.map((item, i) => (
        <m.div
          key={item.pos}
          custom={i}
          variants={podiumVariants}
          whileHover="hover"
          className="relative"
        >
          {item.pos === 1 && (
            <div className="absolute -inset-4 bg-foreground/5 rounded-full blur-3xl animate-pulse" />
          )}
          <Card className={`relative overflow-hidden ${item.pos === 1 ? 'ring-2 ring-foreground/20 shadow-xl shadow-foreground/10' : 'shadow-lg'}`}>
            <div className="h-2 bg-gradient-to-r from-foreground to-foreground" />
            <CardContent className={`p-4 md:p-5 text-center ${item.pos === 1 ? 'pt-5 md:pt-6' : ''}`}>
              <m.div
                className={`w-10 h-10 md:w-12 md:h-12 rounded-full bg-foreground flex items-center justify-center mx-auto mb-3 shadow-lg ${item.pos === 1 ? 'scale-110' : ''}`}
                animate={item.pos === 1 ? {
                  scale: [1, 1.08, 1],
                  transition: { repeat: Infinity, duration: 2.5, ease: 'easeInOut' }
                } : undefined}
              >
                <Crown className="w-5 h-5 md:w-6 md:h-6 text-white drop-shadow" />
              </m.div>
              <p className="font-bold text-sm md:text-base truncate leading-tight">
                @{item.user.instagram}
              </p>
              {item.user.full_name && (
                <p className="text-[10px] md:text-xs text-muted-foreground truncate mt-0.5">
                  {item.user.full_name}
                </p>
              )}
              <div className="mt-3">
                <p className="text-2xl md:text-3xl font-black tracking-tight">
                  {item.user.prediction_points || 0}
                </p>
                <p className="text-[10px] md:text-xs text-muted-foreground uppercase tracking-widest font-semibold">
                  puntos
                </p>
              </div>
            </CardContent>
          </Card>
        </m.div>
      ))}
    </m.div>
  );
}
