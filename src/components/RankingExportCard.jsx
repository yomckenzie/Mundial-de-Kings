import React, { forwardRef } from 'react';
import { formatRankingDate } from '@/lib/dateFormat';

const LOGO_URL = 'https://upload.wikimedia.org/wikipedia/commons/thumb/1/10/Chess_klt45.svg/200px-Chess_klt45.svg.png';

const getRankStyle = (pos) => {
  if (pos === 1) return { bg: 'from-yellow-400 to-yellow-600', text: 'text-yellow-900', medal: '🥇' };
  if (pos === 2) return { bg: 'from-gray-300 to-gray-500', text: 'text-gray-900', medal: '🥈' };
  if (pos === 3) return { bg: 'from-amber-600 to-amber-800', text: 'text-amber-100', medal: '🥉' };
  return { bg: 'from-slate-700 to-slate-900', text: 'text-slate-100', medal: null };
};

const RankingExportCard = forwardRef(({ topUsers, title, date }, ref) => {
  const displayDate = date ? formatRankingDate(date) : formatRankingDate();

  return (
    <div
      ref={ref}
      style={{ width: '480px', fontFamily: 'Inter, sans-serif' }}
      className="bg-gradient-to-b from-slate-900 via-slate-800 to-black p-8 rounded-2xl shadow-2xl"
    >
      {/* Logo & Brand */}
      <div className="flex flex-col items-center mb-6">
        <img
          src={LOGO_URL}
          alt="ChessKing Logo"
          style={{ width: '72px', height: '72px', objectFit: 'contain', filter: 'brightness(0) invert(1)' }}
        />
        <h1 className="text-white font-bold text-3xl tracking-widest mt-2 uppercase">ChessKing</h1>
        <div className="w-24 h-1 bg-yellow-400 rounded-full mt-2" />
      </div>

      {/* Title */}
      <div className="text-center mb-6">
        <h2 className="text-yellow-400 font-bold text-2xl uppercase tracking-wide">
          {title || 'Ranking del Día'}
        </h2>
        <p className="text-slate-400 text-sm mt-1">{displayDate}</p>
      </div>

      {/* Users */}
      <div className="space-y-2">
        {topUsers.map((u, i) => {
          const pos = i + 1;
          const style = getRankStyle(pos);
          const isTop3 = pos <= 3;

          return (
            <div
              key={u.id}
              className={`flex items-center gap-3 rounded-xl px-4 py-3 ${
                isTop3
                  ? `bg-gradient-to-r ${style.bg}`
                  : 'bg-slate-700/60 border border-slate-600/40'
              }`}
            >
              <div className="w-8 text-center flex-shrink-0">
                {style.medal ? (
                  <span className="text-xl">{style.medal}</span>
                ) : (
                  <span className="text-slate-300 font-bold text-sm">#{pos}</span>
                )}
              </div>
              <div className="flex-1 min-w-0">
                <p className={`font-bold text-sm truncate ${isTop3 ? style.text : 'text-white'}`}>
                  @{u.instagram || u.full_name}
                </p>
              </div>
              <div className={`font-bold text-sm flex-shrink-0 ${isTop3 ? style.text : 'text-yellow-400'}`}>
                {u.prediction_points || 0} pts
              </div>
            </div>
          );
        })}
      </div>

      {/* Footer */}
      <div className="mt-6 text-center">
        <p className="text-slate-500 text-xs tracking-widest uppercase">Mundial de Kings 2026</p>
      </div>
    </div>
  );
});

RankingExportCard.displayName = 'RankingExportCard';
export default RankingExportCard;