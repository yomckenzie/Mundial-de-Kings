import React from 'react';
import { useOutletContext } from 'react-router-dom';
import { m } from 'framer-motion';
import { Card, CardContent } from '@/components/ui/card';
import { Trophy, TrendingUp } from 'lucide-react';
import PrizeCard from './prizes/PrizeCard';

// ─────────────────────────────────────────────────────────────────
// PREMIOS ESTÁTICOS — generados desde prizes_backup_20260610
// Con imágenes reales de Supabase Storage.
// ─────────────────────────────────────────────────────────────────
const STATIC_PRIZES = [
  {
    id: 'premio-boxer',
    name: 'Boxer Chess King',
    description: 'Boxer oficial Chess King. Cómodo y duradero.',
    points_cost: 100,
    units_available: 1,
    status: 'active',
    image_url: 'https://khrxddafhzvfdyivysay.supabase.co/storage/v1/object/public/banners/1779802466542_rbr78y.png',
    gradient: 'from-emerald-600 to-emerald-800',
    icon: '🎁',
    sizes: null,
  },
  {
    id: 'premio-boxer-sizes',
    name: 'Boxer Chess King (Tallas)',
    description: 'Disponible en tallas S, M, L, XL.',
    points_cost: 300,
    units_available: 16,
    status: 'active',
    image_url: 'https://khrxddafhzvfdyivysay.supabase.co/storage/v1/object/public/banners/1780957688227_4fc8qp.png',
    gradient: 'from-amber-500 to-orange-700',
    icon: '🎁',
    sizes: { S: 3, M: 1, L: 4, XL: 8 },
  },
  {
    id: 'premio-gorra-anyuri',
    name: 'Gorra Chess King By Anyuri',
    description: 'Gorra edición especial diseñada por Anyuri. Exclusiva.',
    points_cost: 500,
    units_available: 1,
    status: 'active',
    image_url: 'https://khrxddafhzvfdyivysay.supabase.co/storage/v1/object/public/banners/1779802521578_wppte9.png',
    gradient: 'from-violet-600 to-purple-900',
    icon: '🎁',
    sizes: null,
  },
  {
    id: 'premio-gorra',
    name: 'Gorra Chess King',
    description: 'Color gris únicamente. Diseño clásico con logo bordado.',
    points_cost: 500,
    units_available: 6,
    status: 'active',
    image_url: 'https://khrxddafhzvfdyivysay.supabase.co/storage/v1/object/public/banners/1779802566894_88qdy5.png',
    gradient: 'from-pink-500 to-rose-800',
    icon: '🎁',
    sizes: null,
  },
  {
    id: 'premio-jogger',
    name: 'Jogger - Chess King',
    description: 'Jogger deportivo Chess King. Tallas L y XL disponibles.',
    points_cost: 200,
    units_available: 2,
    status: 'active',
    image_url: 'https://khrxddafhzvfdyivysay.supabase.co/storage/v1/object/public/banners/1779802775853_19dmr7.png',
    gradient: 'from-cyan-500 to-blue-800',
    icon: '🎁',
    sizes: null,
  },
  {
    id: 'premio-pantalon-playero',
    name: 'Pantalon Playero - Chess King',
    description: 'Pantalón playero Chess King. Fresco y casual.',
    points_cost: 100,
    units_available: 2,
    status: 'active',
    image_url: 'https://khrxddafhzvfdyivysay.supabase.co/storage/v1/object/public/banners/1779802817887_nv9q0n.png',
    gradient: 'from-blue-600 to-indigo-800',
    icon: '🎁',
    sizes: null,
  },
  {
    id: 'premio-pantalon-playero-full',
    name: 'Pantalon Playero Chees king',
    description: 'Colores surtidos: Negro, mostaza, rojo, blanco, azul. Todas las tallas.',
    points_cost: 600,
    units_available: 30,
    status: 'active',
    image_url: 'https://khrxddafhzvfdyivysay.supabase.co/storage/v1/object/public/banners/1779805743208_v54uty.png',
    gradient: 'from-rose-500 to-red-800',
    icon: '🎁',
    sizes: { S: 8, M: 11, L: 7, XL: 4 },
  },
  {
    id: 'premio-tshirt-anyuri',
    name: 'Tshirts Anyuri By Chess King',
    description: 'Camisetas diseñadas por Anyuri. Colores azul y rosa, colores surtidos.',
    points_cost: 500,
    units_available: 43,
    status: 'active',
    image_url: 'https://khrxddafhzvfdyivysay.supabase.co/storage/v1/object/public/banners/1780006589236_o63hf9.png',
    gradient: 'from-teal-500 to-green-800',
    icon: '🎁',
    sizes: { XS: 3, S: 4, M: 14, L: 16, XL: 13 },
  },
  {
    id: 'premio-tshirt-king',
    name: 'Tshirts Chess King',
    description: 'Camisetas clásicas Chess King. Varias tallas y colores.',
    points_cost: 500,
    units_available: 6,
    status: 'active',
    image_url: 'https://khrxddafhzvfdyivysay.supabase.co/storage/v1/object/public/banners/1780007099712_wzhbqv.png',
    gradient: 'from-orange-500 to-red-700',
    icon: '🎁',
    sizes: null,
  },
  {
    id: 'premio-manga-larga',
    name: 'Tshirts - Manga Larga Chess King',
    description: 'Camiseta manga larga Chess King. Ideal para cualquier ocasión.',
    points_cost: 100,
    units_available: 1,
    status: 'active',
    image_url: 'https://khrxddafhzvfdyivysay.supabase.co/storage/v1/object/public/banners/1780007202843_kadkk6.png',
    gradient: 'from-sky-500 to-blue-800',
    icon: '🎁',
    sizes: null,
  },
  {
    id: 'premio-hoodie',
    name: 'Hoodie Chess King',
    description: 'Hoodie oficial Chess King. Cómodo y con estilo.',
    points_cost: 100,
    units_available: 1,
    status: 'active',
    image_url: 'https://khrxddafhzvfdyivysay.supabase.co/storage/v1/object/public/banners/1780007225709_elrfoq.png',
    gradient: 'from-lime-500 to-green-700',
    icon: '🎁',
    sizes: null,
  },
  {
    id: 'premio-manga-larga-2',
    name: 'Tshirts - Manga Larga Chess King',
    description: 'Tallas M Blanco (2) y Negro (1).',
    points_cost: 600,
    units_available: 3,
    status: 'active',
    image_url: 'https://khrxddafhzvfdyivysay.supabase.co/storage/v1/object/public/banners/1780954897549_84x7rz.png',
    gradient: 'from-fuchsia-500 to-purple-800',
    icon: '🎁',
    sizes: null,
  },
  {
    id: 'premio-manga-corta',
    name: 'Tshirts - Manga Corta Chess King',
    description: 'Camiseta manga corta Chess King. Fresca y ligera.',
    points_cost: 400,
    units_available: 3,
    status: 'active',
    image_url: 'https://khrxddafhzvfdyivysay.supabase.co/storage/v1/object/public/banners/1780007316206_e5ar70.png',
    gradient: 'from-emerald-600 to-emerald-800',
    icon: '🎁',
    sizes: null,
  },
  {
    id: 'premio-box-limitada',
    name: 'Box - Anyuri By Chess King - Edicion Limitada',
    description: 'Kit sin muñeca, solo T-shirt y gorra. Edición limitada.',
    points_cost: 800,
    units_available: 3,
    status: 'active',
    image_url: 'https://khrxddafhzvfdyivysay.supabase.co/storage/v1/object/public/banners/1780007362998_x60t69.png',
    gradient: 'from-amber-500 to-orange-700',
    icon: '🎁',
    sizes: null,
  },
  {
    id: 'premio-tshirt-mc',
    name: 'Tshirt-Manga Corta Chees King',
    description: 'Camiseta manga corta. Diseño exclusivo.',
    points_cost: 400,
    units_available: 1,
    status: 'active',
    image_url: 'https://khrxddafhzvfdyivysay.supabase.co/storage/v1/object/public/banners/1780954921993_8ut8p8.png',
    gradient: 'from-violet-600 to-purple-900',
    icon: '🎁',
    sizes: null,
  },
  {
    id: 'premio-tshirt-modelos',
    name: 'T-shirt Chees King',
    description: 'Únicos modelos, los print varían. Talla M.',
    points_cost: 500,
    units_available: 20,
    status: 'active',
    image_url: 'https://khrxddafhzvfdyivysay.supabase.co/storage/v1/object/public/banners/1780955063674_qua7yx.png',
    gradient: 'from-pink-500 to-rose-800',
    icon: '🎁',
    sizes: null,
  },
  {
    id: 'premio-tshirt-varios',
    name: 'Tshirt Chees King (Varios)',
    description: 'Camisetas Chees King en variedad de tallas y colores.',
    points_cost: 500,
    units_available: 41,
    status: 'active',
    image_url: 'https://khrxddafhzvfdyivysay.supabase.co/storage/v1/object/public/banners/1780955106572_abk7cg.png',
    gradient: 'from-cyan-500 to-blue-800',
    icon: '🎁',
    sizes: { S: 7, M: 16, L: 9, XL: 4 },
  },
  {
    id: 'premio-pantalones-hype',
    name: 'Pantalones hype - Chees King',
    description: 'Pantalones hype Chees King. Tallas 34, 36, 38, 40.',
    points_cost: 750,
    units_available: 4,
    status: 'active',
    image_url: 'https://khrxddafhzvfdyivysay.supabase.co/storage/v1/object/public/banners/1780955566534_gzrfks.png',
    gradient: 'from-blue-600 to-indigo-800',
    icon: '🎁',
    sizes: null,
  },
  {
    id: 'premio-bermuda',
    name: 'Pantalon Bermuda - Chees king',
    description: 'Bermuda Chees King. Tallas 32 y 36 disponibles.',
    points_cost: 600,
    units_available: 2,
    status: 'active',
    image_url: 'https://khrxddafhzvfdyivysay.supabase.co/storage/v1/object/public/banners/1780955706928_po0knd.png',
    gradient: 'from-rose-500 to-red-800',
    icon: '🎁',
    sizes: null,
  },
  {
    id: 'premio-gorros-bucket',
    name: 'Gorros bucket Chees King',
    description: 'Gorros bucket Chees King. El accesorio perfecto.',
    points_cost: 500,
    units_available: 34,
    status: 'active',
    image_url: 'https://khrxddafhzvfdyivysay.supabase.co/storage/v1/object/public/banners/1780955840852_wlhy7c.png',
    gradient: 'from-teal-500 to-green-800',
    icon: '🎁',
    sizes: null,
  },
  {
    id: 'premio-basicas',
    name: 'Tshirt Basicas Chees King',
    description: 'Camisetas básicas Chees King. Tallas S, M, L.',
    points_cost: 500,
    units_available: 13,
    status: 'active',
    image_url: 'https://khrxddafhzvfdyivysay.supabase.co/storage/v1/object/public/banners/1780957703699_xf0hes.png',
    gradient: 'from-orange-500 to-red-700',
    icon: '🎁',
    sizes: { S: 8, M: 3, L: 2 },
  },
  {
    id: 'premio-basicas-s',
    name: 'Tshirt Basicas Talla S Chees King',
    description: 'Camisetas básicas talla S. Pack especial talla pequeña.',
    points_cost: 500,
    units_available: 6,
    status: 'active',
    image_url: 'https://khrxddafhzvfdyivysay.supabase.co/storage/v1/object/public/banners/1780957859123_thwqbm.png',
    gradient: 'from-sky-500 to-blue-800',
    icon: '🎁',
    sizes: { S: 6 },
  },
];

const containerVariants = {
  hidden: { opacity: 0 },
  visible: {
    opacity: 1,
    transition: { staggerChildren: 0.04, delayChildren: 0.1 }
  }
};

const itemVariants = {
  hidden: { opacity: 0, y: 20, scale: 0.95 },
  visible: { opacity: 1, y: 0, scale: 1, transition: { duration: 0.4, ease: 'easeOut' } },
  hover: { y: -6, transition: { duration: 0.25, ease: 'easeOut' } }
};

export default function Prizes() {
  const { user } = useOutletContext();
  const prizes = STATIC_PRIZES;
  const totalPoints = user?.total_points || 0;
  const availablePoints = totalPoints;

  const pointsProgress = prizes.length > 0
    ? Math.min(100, Math.round((availablePoints / Math.max(...prizes.map(p => p.points_cost))) * 100))
    : 0;

  return (
    <m.div
      className="space-y-6"
      variants={containerVariants}
      initial="hidden"
      animate="visible"
    >
      {/* Header */}
      <m.div className="flex items-center justify-between" variants={itemVariants}>
        <div>
          <h1 className="font-display text-4xl tracking-wide">PREMIOS</h1>
          <p className="text-sm text-muted-foreground mt-1">Canjea tus puntos por premios increíbles</p>
        </div>
        {user && (
          <m.div
            className="flex items-center gap-2 bg-muted/50 border border-border px-4 py-2 rounded-full text-sm font-medium"
            initial={{ opacity: 0, x: 10 }}
            animate={{ opacity: 1, x: 0 }}
            transition={{ delay: 0.2 }}
          >
            <Trophy className="w-4 h-4 text-foreground" />
            <span className="text-foreground">
              <span className="font-black">{availablePoints}</span> pts
            <span className="text-xs text-muted-foreground ml-1 font-normal">disp.</span>
            </span>
          </m.div>
        )}
      </m.div>

      {/* Points progress bar */}
      {user && pointsProgress > 0 && (
        <m.div variants={itemVariants}>
          <Card className="overflow-hidden">
            <CardContent className="p-4">
              <div className="flex items-center justify-between mb-2">
                <div className="flex items-center gap-1.5 text-sm text-muted-foreground">
                  <TrendingUp className="w-4 h-4 text-foreground" />
                  Tu progreso
                </div>
                <span className="text-xs font-medium">{totalPoints} pts ganados · {availablePoints} pts disp.</span>
              </div>
              <div className="h-2.5 bg-muted rounded-full overflow-hidden">
                <m.div
                  className="h-full bg-gradient-to-r from-secondary to-amber-500 rounded-full"
                  initial={{ width: 0 }}
                  animate={{ width: `${pointsProgress}%` }}
                  transition={{ duration: 1, ease: 'easeOut', delay: 0.3 }}
                />
              </div>
              <p className="text-[10px] text-muted-foreground mt-1.5 text-right">
                {pointsProgress}% del premio más costoso
              </p>
            </CardContent>
          </Card>
        </m.div>
      )}

      <m.div
        className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4"
        variants={containerVariants}
      >
        {prizes.map((prize, i) => (
          <m.div
            key={prize.id}
            custom={i}
            variants={itemVariants}
            whileHover="hover"
            whileTap={{ scale: 0.98 }}
          >
            <PrizeCard prize={prize} />
          </m.div>
        ))}
      </m.div>
    </m.div>
  );
}
