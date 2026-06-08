import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Gift, Package, UserPlus, Sparkles, Trophy, Search } from 'lucide-react';
import { Link } from 'react-router-dom';

export default function PrizeCard({ prize, user, availablePoints, onRedeem, onPreview, redeemPending }) {
  const canRedeem = user && availablePoints >= prize.points_cost;
  const soldOut = prize.units_available <= 0;

  return (
    <Card className="overflow-hidden h-full flex flex-col">
      {prize.image_url ? (
        <button
          type="button"
          aria-label={`Ver imagen de ${prize.name}`}
          className="aspect-video w-full overflow-hidden cursor-pointer group relative block p-0 border-0"
          onClick={() => onPreview(prize)}
        >
          <img src={prize.image_url} alt={prize.name} loading="lazy" decoding="async" className="w-full h-full object-cover transition-transform duration-300 group-hover:scale-105" />
          <div className="absolute inset-0 bg-black/0 group-hover:bg-black/20 transition-colors flex items-center justify-center">
            <div className="w-10 h-10 rounded-full bg-white/90 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity transform scale-75 group-hover:scale-100 duration-200">
              <Search className="w-[18px] h-[18px]" />
            </div>
          </div>
        </button>
      ) : (
        <div className="aspect-video w-full bg-muted flex items-center justify-center">
          <Gift className="w-10 h-10 text-muted-foreground/30" />
        </div>
      )}
      <CardContent className="p-4 flex flex-col flex-1">
        <div className="flex items-start justify-between mb-2">
          <div>
            <h3 className="font-semibold">{prize.name}</h3>
          </div>
          <Badge variant="outline" className="text-xs shrink-0 ml-2">
            {prize.points_cost} pts
          </Badge>
        </div>
        {prize.description && (
          <p className="text-sm text-muted-foreground mb-3 flex-1">{prize.description}</p>
        )}
        <div className="flex items-center gap-2 mb-3">
          <Package className="w-3.5 h-3.5 text-muted-foreground" />
          <div className="text-xs text-muted-foreground">
            {prize.units_available} {prize.units_available === 1 ? 'disponible' : 'disponibles'}
          </div>
        </div>

        {!user ? (
          <Link to="/register" className="block">
            <Button variant="outline" className="w-full gap-2">
              <UserPlus className="w-4 h-4" />
              Regístrate para canjear
            </Button>
          </Link>
        ) : soldOut ? (
          <Button className="w-full" disabled>
            <Package className="w-4 h-4 mr-1.5" />
            Agotado
          </Button>
        ) : (
          <Button
            className={`w-full gap-1.5 ${!canRedeem ? 'opacity-70' : 'glow-sm'}`}
            disabled={!canRedeem || redeemPending}
            onClick={() => onRedeem(prize)}
          >
            {redeemPending ? (
              <>
                <span className="w-4 h-4 border-2 border-current border-t-transparent rounded-full animate-spin" />
                Canjeando...
              </>
            ) : canRedeem ? (
              <>
                <Sparkles className="w-4 h-4" />
                Canjear premio
              </>
            ) : (
              <>
                <Trophy className="w-4 h-4" />
                Faltan {prize.points_cost - availablePoints} pts
              </>
            )}
          </Button>
        )}
      </CardContent>
    </Card>
  );
}
