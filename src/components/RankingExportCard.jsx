import React, { forwardRef } from 'react';
import { format } from 'date-fns';
import { es } from 'date-fns/locale/es';

// ── Color palette per position ──
const RANK_STYLES = {
  1: {
    bg: 'bg-gradient-to-r from-[#FFD700] to-[#FFA500]',
    border: 'border-[#FFD700]',
    shadow: '0 0 20px rgba(255,215,0,0.3)',
    text: 'text-[#1a1a2e]',
    subtext: 'text-[#1a1a2e]/70',
    medal: '🥇',
  },
  2: {
    bg: 'bg-gradient-to-r from-[#C0C0C0] to-[#A8A8A8]',
    border: 'border-[#C0C0C0]',
    shadow: '0 0 15px rgba(192,192,192,0.25)',
    text: 'text-[#1a1a2e]',
    subtext: 'text-[#1a1a2e]/70',
    medal: '🥈',
  },
  3: {
    bg: 'bg-gradient-to-r from-[#CD7F32] to-[#B8860B]',
    border: 'border-[#CD7F32]',
    shadow: '0 0 15px rgba(205,127,50,0.25)',
    text: 'text-white',
    subtext: 'text-white/70',
    medal: '🥉',
  },
};

const DEFAULT_RANK = {
  bg: 'bg-[#1e1e3a]/60',
  border: 'border-[#2a2a4a]',
  shadow: 'none',
  text: 'text-white',
  subtext: 'text-slate-400',
  medal: null,
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

// ── Inline SVG Crown ──
const CrownIcon = ({ size = 32 }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none">
    <path d="M2 19h20v2H2v-2zM2 5l5 4 5-6 5 6 5-4v12H2V5z" fill="currentColor" />
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
      style={{ width: '600px', fontFamily: "'Inter', 'Segoe UI', sans-serif" }}
      className="relative overflow-hidden rounded-3xl p-0"
    >
      {/* Background */}
      <div
        className="absolute inset-0"
        style={{
          background: 'linear-gradient(160deg, #0f0f23 0%, #1a1a3e 25%, #16213e 50%, #0f0f23 75%, #0a0a1a 100%)',
        }}
      />
      {/* Chess pattern overlay */}
      <div
        className="absolute inset-0 opacity-[0.03]"
        style={{
          backgroundImage:
            'repeating-linear-gradient(0deg, transparent, transparent 20px, rgba(255,255,255,0.03) 20px, rgba(255,255,255,0.03) 21px), repeating-linear-gradient(90deg, transparent, transparent 20px, rgba(255,255,255,0.03) 20px, rgba(255,255,255,0.03) 21px)',
        }}
      />
      {/* Corner glows */}
      <div className="absolute -top-20 -right-20 w-64 h-64 rounded-full opacity-20" style={{ background: 'radial-gradient(circle, rgba(255,215,0,0.4) 0%, transparent 70%)' }} />
      <div className="absolute -bottom-20 -left-20 w-48 h-48 rounded-full opacity-10" style={{ background: 'radial-gradient(circle, rgba(255,215,0,0.3) 0%, transparent 70%)' }} />

      <div className="relative px-8 py-8">
        {/* ═══ HEADER ═══ */}
        <div className="flex flex-col items-center mb-8">
          <div
            className="w-16 h-16 rounded-full flex items-center justify-center mb-3"
            style={{
              background: 'linear-gradient(135deg, #FFD700, #FFA500)',
              boxShadow: '0 0 30px rgba(255,215,0,0.3)',
            }}
          >
            <CrownIcon size={28} />
          </div>

          <h1
            className="text-4xl font-black tracking-[0.2em] uppercase mb-1"
            style={{
              color: '#FFD700',
              background: 'linear-gradient(135deg, #FFD700 0%, #FFA500 50%, #FFD700 100%)',
              WebkitBackgroundClip: 'text',
              WebkitTextFillColor: 'transparent',
              backgroundClip: 'text',
            }}
          >
            ChessKing
          </h1>

          {/* Golden divider */}
          <div className="flex items-center gap-3 w-full max-w-[280px] my-3">
            <div className="flex-1 h-[1px]" style={{ background: 'linear-gradient(90deg, transparent, rgba(255,215,0,0.5))' }} />
            <div className="w-2 h-2 rotate-45" style={{ background: '#FFD700', boxShadow: '0 0 6px rgba(255,215,0,0.5)' }} />
            <div className="flex-1 h-[1px]" style={{ background: 'linear-gradient(90deg, rgba(255,215,0,0.5), transparent)' }} />
          </div>

          <h2 className="text-2xl font-bold uppercase tracking-[0.15em] mb-1" style={{ color: '#FFD700' }}>
            {title || 'Ranking del Día'}
          </h2>
          <p className="text-sm tracking-wider" style={{ color: 'rgba(255,255,255,0.4)' }}>
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
                <div className="w-10 text-center flex-shrink-0">
                  {style.medal ? (
                    <span className="text-2xl drop-shadow-lg">{style.medal}</span>
                  ) : (
                    <span className="text-sm font-bold" style={{ color: 'rgba(255,255,255,0.4)' }}>#{pos}</span>
                  )}
                </div>

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

                <div className="flex-1 min-w-0">
                  <p className={`font-bold text-sm leading-tight ${style.text}`}>
                    @{u.instagram || u.full_name}
                  </p>
                  {u.full_name && (
                    <p className={`text-[11px] mt-0.5 truncate ${style.subtext}`}>{u.full_name}</p>
                  )}
                </div>

                <div className="flex flex-col items-end flex-shrink-0">
                  <span
                    className="font-black text-lg leading-none"
                    style={{ color: isTop3 ? style.text : '#FFD700' }}
                  >
                    {points}
                  </span>
                  <span
                    className="text-[9px] uppercase tracking-widest font-semibold mt-0.5"
                    style={{ color: isTop3 ? style.subtext : 'rgba(255,215,0,0.5)' }}
                  >
                    pts
                  </span>
                </div>

                {/* Progress bar (subtle, bottom edge) */}
                {!isTop3 && (
                  <div className="absolute bottom-0 left-0 right-0 h-[3px] rounded-b-2xl overflow-hidden" style={{ background: 'rgba(255,255,255,0.05)' }}>
                    <div
                      className="h-full rounded-b-2xl"
                      style={{
                        width: `${barWidth}%`,
                        background: 'linear-gradient(90deg, rgba(255,215,0,0.3), rgba(255,165,0,0.15))',
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
          <div className="flex items-center gap-3 w-full max-w-[200px] mx-auto mb-3">
            <div className="flex-1 h-[1px]" style={{ background: 'linear-gradient(90deg, transparent, rgba(255,255,255,0.08))' }} />
            <div className="w-1 h-1 rounded-full" style={{ background: 'rgba(255,215,0,0.3)' }} />
            <div className="flex-1 h-[1px]" style={{ background: 'linear-gradient(90deg, rgba(255,255,255,0.08), transparent)' }} />
          </div>
          <p className="text-xs tracking-[0.2em] uppercase font-semibold" style={{ color: 'rgba(255,255,255,0.2)' }}>
            Mundiales de Kings 2026
          </p>
        </div>
      </div>
    </div>
  );
});

RankingExportCard.displayName = 'RankingExportCard';
export default RankingExportCard;