import React, { forwardRef } from 'react';
import { format } from 'date-fns';
import { es } from 'date-fns/locale/es';

// ── Color palette from the SVG background ──
const RED = '#ff0031';
const BLUE = '#0055ff';
const YELLOW = '#f9ea14';

const RANK_STYLES = {
  1: {
    bg: 'bg-gradient-to-r from-[#ff0031] to-[#cc0027]',
    border: 'border-[#ff0031]',
    shadow: '0 0 24px rgba(255,0,49,0.35)',
    text: 'text-white',
    subtext: 'text-white/70',
    accent: RED,
    badge: '👑',
  },
  2: {
    bg: 'bg-gradient-to-r from-[#0055ff] to-[#0033cc]',
    border: 'border-[#0055ff]',
    shadow: '0 0 20px rgba(0,85,255,0.3)',
    text: 'text-white',
    subtext: 'text-white/70',
    accent: BLUE,
    badge: '🥈',
  },
  3: {
    bg: 'bg-gradient-to-r from-[#f9ea14] to-[#d4c800]',
    border: 'border-[#f9ea14]',
    shadow: '0 0 20px rgba(249,234,20,0.3)',
    text: 'text-[#0a0a1a]',
    subtext: 'text-[#0a0a1a]/70',
    accent: YELLOW,
    badge: '🥉',
  },
};

const DEFAULT_RANK = {
  bg: 'bg-[#0a0a1a]/70',
  border: 'border-[#1a1a3a]',
  shadow: 'none',
  text: 'text-white',
  subtext: 'text-slate-400',
  accent: 'rgba(0,85,255,0.3)',
  badge: null,
};

function getRankStyle(pos) {
  return RANK_STYLES[pos] || DEFAULT_RANK;
}

function stringToColor(str) {
  if (!str) return '#6B5B95';
  let hash = 0;
  for (let i = 0; i < str.length; i++) {
    hash = str.charCodeAt(i) + ((hash << 5) - hash);
  }
  const colors = [
    '#FF6B6B', '#4ECDC4', '#45B7D1', '#96CEB4',
    '#FFEAA7', '#DDA0DD', '#98D8C8', '#F7DC6F',
    '#BB8FCE', '#85C1E9', '#F0B27A', '#82E0AA',
    '#F1948A', '#85929E', '#73C6B6', '#E59866',
  ];
  return colors[Math.abs(hash) % colors.length];
}

function getInitials(name, instagram) {
  const target = name || instagram || '?';
  const parts = target.trim().split(/\s+/);
  if (parts.length >= 2) {
    return (parts[0][0] + parts[1][0]).toUpperCase();
  }
  return target.slice(0, 2).toUpperCase();
}

// ── Crown Icon (golden style) ──
const CrownIcon = ({ size = 32 }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none">
    <path d="M2 19h20v2H2v-2zM2 5l5 4 5-6 5 6 5-4v12H2V5z" fill={YELLOW} />
  </svg>
);

// ── Component ──
const RankingExportCard = forwardRef(({ topUsers, title, date }, ref) => {
  const displayDate = date
    ? format(new Date(date + 'T12:00:00'), "d 'de' MMMM 'de' yyyy", { locale: es })
    : format(new Date(), "d 'de' MMMM 'de' yyyy", { locale: es });

  const maxPoints = topUsers.length > 0
    ? Math.max(...topUsers.map((u) => u.prediction_points || 0), 1)
    : 1;

  return (
    <div
      ref={ref}
      style={{
        width: '600px',
        fontFamily: "'Inter', 'Segoe UI', sans-serif",
      }}
      className="relative overflow-hidden rounded-3xl"
    >
      {/* SVG Background: covers entire card */}
      <div
        className="absolute inset-0"
        style={{
          backgroundImage: `url('/backgrounds/top-ranking-bg.svg')`,
          backgroundSize: 'cover',
          backgroundPosition: 'center',
        }}
      />
      {/* Dark overlay for text readability */}
      <div
        className="absolute inset-0"
        style={{
          background:
            'linear-gradient(180deg, rgba(10,10,26,0.4) 0%, rgba(10,10,26,0.15) 30%, rgba(10,10,26,0.15) 70%, rgba(10,10,26,0.5) 100%)',
        }}
      />

      {/* Red glow corner accents */}
      <div
        className="absolute -top-24 -right-24 w-80 h-80 rounded-full opacity-[0.12]"
        style={{ background: `radial-gradient(circle, ${RED} 0%, transparent 70%)` }}
      />
      <div
        className="absolute -bottom-24 -left-24 w-80 h-80 rounded-full opacity-[0.08]"
        style={{ background: `radial-gradient(circle, ${BLUE} 0%, transparent 70%)` }}
      />

      <div className="relative px-8 py-8">
        {/* ═══ HEADER ═══ */}
        <div className="flex flex-col items-center mb-8">
          {/* Crown circle */}
          <div
            className="w-16 h-16 rounded-full flex items-center justify-center mb-3"
            style={{
              background: `linear-gradient(135deg, ${RED}, #cc0027)`,
              boxShadow: `0 0 30px ${RED}55`,
            }}
          >
            <CrownIcon size={28} />
          </div>

          {/* ChessKing title in yellow */}
          <h1
            className="text-4xl font-black tracking-[0.2em] uppercase mb-1"
            style={{
              color: YELLOW,
              background: `linear-gradient(135deg, ${YELLOW} 0%, #fff 40%, ${YELLOW} 70%, #f9ea14 100%)`,
              WebkitBackgroundClip: 'text',
              WebkitTextFillColor: 'transparent',
              backgroundClip: 'text',
              filter: 'drop-shadow(0 0 12px rgba(249,234,20,0.3))',
            }}
          >
            ChessKing
          </h1>

          {/* Red-Yellow-Blue divider */}
          <div className="flex items-center gap-3 w-full max-w-[320px] my-3">
            <div
              className="flex-1 h-[1px]"
              style={{
                background: `linear-gradient(90deg, transparent, ${RED}, ${YELLOW})`,
              }}
            />
            <div
              className="w-2.5 h-2.5 rotate-45"
              style={{
                background: `linear-gradient(135deg, ${RED}, ${YELLOW})`,
                boxShadow: `0 0 8px ${RED}66`,
              }}
            />
            <div
              className="flex-1 h-[1px]"
              style={{
                background: `linear-gradient(90deg, ${YELLOW}, ${BLUE}, transparent)`,
              }}
            />
          </div>

          <h2
            className="text-2xl font-bold uppercase tracking-[0.15em] mb-1"
            style={{ color: YELLOW }}
          >
            {title || 'Ranking del Día'}
          </h2>
          <p className="text-sm tracking-wider" style={{ color: 'rgba(255,255,255,0.45)' }}>
            {displayDate}
          </p>
        </div>

        {/* ═══ USERS ═══ */}
        <div className="space-y-2.5">
          {topUsers.map((u, i) => {
            const pos = i + 1;
            const style = getRankStyle(pos);
            const isTop3 = pos <= 3;
            const avatarColor = stringToColor(u.instagram || u.full_name);
            const initials = getInitials(u.full_name, u.instagram);
            const points = u.prediction_points || 0;
            const barWidth = (points / maxPoints) * 100;

            return (
              <div
                key={u.id}
                className={`relative flex items-center gap-4 rounded-2xl px-5 py-4 border ${style.bg} ${style.border}`}
                style={{
                  boxShadow: isTop3 ? style.shadow : 'none',
                }}
              >
                {/* Rank badge */}
                <div className="w-10 text-center flex-shrink-0">
                  {style.badge ? (
                    <span className="text-2xl drop-shadow-lg">{style.badge}</span>
                  ) : (
                    <span
                      className="text-sm font-bold"
                      style={{ color: 'rgba(255,255,255,0.35)' }}
                    >
                      #{pos}
                    </span>
                  )}
                </div>

                {/* Avatar */}
                <div
                  className="w-10 h-10 rounded-full flex items-center justify-center flex-shrink-0 text-sm font-bold uppercase"
                  style={{
                    background: `linear-gradient(135deg, ${avatarColor}, ${avatarColor}dd)`,
                    color: '#fff',
                    boxShadow: `0 0 12px ${avatarColor}44`,
                  }}
                >
                  {initials}
                </div>

                {/* User info */}
                <div className="flex-1 min-w-0">
                  <p className={`font-bold text-sm leading-tight ${style.text}`}>
                    @{u.instagram || u.full_name}
                  </p>
                  {u.full_name && (
                    <p className={`text-[11px] mt-0.5 truncate ${style.subtext}`}>{u.full_name}</p>
                  )}
                </div>

                {/* Points */}
                <div className="flex flex-col items-end flex-shrink-0">
                  <span
                    className="font-black text-lg leading-none"
                    style={{
                      color: isTop3 ? (pos === 3 ? '#0a0a1a' : '#fff') : YELLOW,
                      textShadow: isTop3
                        ? `0 0 12px ${style.accent}66`
                        : 'none',
                    }}
                  >
                    {points}
                  </span>
                  <span
                    className="text-[9px] uppercase tracking-widest font-semibold mt-0.5"
                    style={{
                      color: isTop3 ? (pos === 3 ? 'rgba(10,10,26,0.5)' : 'rgba(255,255,255,0.5)') : `${YELLOW}88`,
                    }}
                  >
                    pts
                  </span>
                </div>

                {/* Progress bar for non-top-3 */}
                {!isTop3 && (
                  <div
                    className="absolute bottom-0 left-0 right-0 h-[3px] rounded-b-2xl overflow-hidden"
                    style={{ background: 'rgba(255,255,255,0.04)' }}
                  >
                    <div
                      className="h-full rounded-b-2xl"
                      style={{
                        width: `${barWidth}%`,
                        background: `linear-gradient(90deg, ${BLUE}66, ${BLUE}22)`,
                      }}
                    />
                  </div>
                )}
              </div>
            );
          })}
        </div>

        {/* ═══ FOOTER ═══ */}
        <div className="mt-8 text-center">
          <div className="flex items-center gap-3 w-full max-w-[240px] mx-auto mb-3">
            <div
              className="flex-1 h-[1px]"
              style={{ background: `linear-gradient(90deg, transparent, ${RED}44)` }}
            />
            <div
              className="w-1.5 h-1.5 rounded-full"
              style={{ background: RED, boxShadow: `0 0 6px ${RED}` }}
            />
            <div
              className="flex-1 h-[1px]"
              style={{ background: `linear-gradient(90deg, ${RED}44, transparent)` }}
            />
          </div>
          <p
            className="text-xs tracking-[0.2em] uppercase font-semibold"
            style={{ color: 'rgba(255,255,255,0.18)' }}
          >
            Mundiales de Kings 2026
          </p>
        </div>
      </div>
    </div>
  );
});

RankingExportCard.displayName = 'RankingExportCard';
export default RankingExportCard;