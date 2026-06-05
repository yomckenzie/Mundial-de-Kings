import { m } from 'framer-motion';
import { Card, CardContent } from '@/components/ui/card';
import { Trophy, ArrowUp } from 'lucide-react';

function getPointGap(currentPoints, previousPoints) {
  if (previousPoints == null || currentPoints == null) return null;
  const diff = previousPoints - currentPoints;
  if (diff <= 0) return null;
  return diff;
}

export default function MyRankCard({ myUser, myRank, allUsers }) {
  if (!myRank || !myUser) return null;

  return (
    <m.div variants={{ hidden: { opacity: 0, y: 16 }, visible: { opacity: 1, y: 0, transition: { duration: 0.35, ease: [0.25, 0.46, 0.45, 0.94] } } }}>
      <Card className="gradient-border overflow-hidden relative group">
        <div className="absolute top-0 right-0 w-32 h-32 bg-foreground/5 rounded-full blur-3xl -translate-y-1/2 translate-x-1/2 group-hover:scale-150 transition-transform duration-700" />
        <CardContent className="p-5 md:p-6 flex items-center justify-between relative">
          <div className="flex items-center gap-4">
            <div className="w-12 h-12 rounded-xl bg-foreground flex items-center justify-center shadow-lg group-hover:scale-110 transition-transform duration-300">
              <Trophy className="w-6 h-6 text-background" />
            </div>
            <div>
              <p className="text-xs text-muted-foreground font-medium uppercase tracking-wider">
                Tu posición
              </p>
              <m.p
                className="text-3xl font-black"
                initial={{ scale: 0.95 }}
                animate={{ scale: 1 }}
                transition={{ type: 'spring', stiffness: 350, damping: 12, delay: 0.4 }}
              >
                #{myRank}
                <span className="text-sm font-normal text-muted-foreground ml-2">
                  de {allUsers.length}
                </span>
              </m.p>
            </div>
          </div>
          <div className="text-right">
            <p className="text-xs text-muted-foreground font-medium uppercase tracking-wider">Puntos</p>
            <m.p
              className="text-3xl font-black text-foreground"
              initial={{ scale: 0.95 }}
              animate={{ scale: 1 }}
              transition={{ type: 'spring', stiffness: 350, damping: 12, delay: 0.5 }}
            >
              {myUser.prediction_points || 0}
            </m.p>
            {myRank > 1 && (
              <p className="text-[10px] text-muted-foreground mt-0.5 flex items-center gap-0.5 justify-end">
                <ArrowUp className="w-3 h-3" />
                a {getPointGap(myUser.prediction_points, allUsers[myRank - 2]?.prediction_points) ?? '-'} del {myRank - 1}º
              </p>
            )}
          </div>
        </CardContent>
      </Card>
    </m.div>
  );
}
