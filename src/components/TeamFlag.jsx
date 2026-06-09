import { m } from 'framer-motion';
import { getFlagImageUrl, getTeamFlag } from '@/lib/teamFlags';

/**
 * Componente que muestra la bandera de un equipo en un círculo.
 * - Tamaños grandes (lg/xl/hero): SVG vectorial de flagcdn.com — calidad perfecta a cualquier resolución.
 * - Tamaños pequeños (sm/md): emoji nativo (se ve nítido en ese tamaño).
 * - Diseño circular con overflow-hidden para que la bandera se recorte limpia.
 * @param {{ team: string, size?: 'sm'|'md'|'lg'|'xl'|'hero', isLive?: boolean }} props
 */
const sizeClasses = {
  sm: 'w-7 h-7 text-base',
  md: 'w-9 h-9 text-lg',
  lg: 'w-16 h-16',
  xl: 'w-24 h-24 sm:w-28 sm:h-28',
  hero: 'w-16 h-16 sm:w-28 sm:h-28 md:w-32 md:h-32 lg:w-36 lg:h-36',
};

const SVG_SIZES = new Set(['lg', 'xl', 'hero']);

export default function TeamFlag({ team, size = 'sm', isLive = false }) {
  const imgUrl = getFlagImageUrl(team);
  const flagEmoji = getTeamFlag(team);
  if (!imgUrl && !flagEmoji) return null;

  const isSvgSize = SVG_SIZES.has(size);

  const sizeClass = sizeClasses[size] || sizeClasses.sm;

  // ── SVG (tamaños grandes) — circular, object-cover ──
  if (isSvgSize && imgUrl) {
    const Tag = isLive ? m.span : 'span';
    return (
      <Tag
        className={`inline-flex items-center justify-center shrink-0 rounded-full overflow-hidden ${sizeClass} ${
          isLive
            ? 'ring-2 ring-red-500/60'
            : 'ring-1 ring-border/40'
        }`}
        title={team}
        {...(isLive && {
          animate: {
            boxShadow: [
              '0 0 8px rgba(239,68,68,0.3)',
              '0 0 20px rgba(239,68,68,0.6)',
              '0 0 8px rgba(239,68,68,0.3)',
            ],
          },
          transition: {
            duration: 2,
            repeat: Infinity,
            ease: 'easeInOut',
          },
        })}
      >
        <img
          src={imgUrl}
          alt={`Bandera de ${team}`}
          className="w-full h-full block"
          style={{ objectFit: 'cover' }}
          loading="lazy"
          draggable={false}
        />
      </Tag>
    );
  }

  // ── Emoji (tamaños pequeños) — circular con fondo sutil ──
  return (
    <span
      className={`inline-flex items-center justify-center shrink-0 rounded-full overflow-hidden bg-muted/60 ${sizeClass}`}
      title={team}
    >
      <span className="leading-none">{flagEmoji}</span>
    </span>
  );
}
