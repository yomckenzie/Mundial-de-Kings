import { forwardRef } from 'react';
import { format } from 'date-fns';
import { es } from 'date-fns/locale/es';

// Paleta tomada de la plantilla de grafiti (rojo / azul / amarillo)
const RED = '#ff0031';
const BLUE = '#0055ff';
const YELLOW = '#f9ea14';
const INK = '#0d0d1a';

// Estilo de barra por posición (sticker sobre la pared de ladrillos)
const ROW_STYLE = {
  1: { bg: RED, color: '#fff', tag: '👑' },
  2: { bg: BLUE, color: '#fff', tag: '2' },
  3: { bg: YELLOW, color: INK, tag: '3' },
};
const DEFAULT_ROW = { bg: 'rgba(13,13,26,0.9)', color: '#fff', tag: null };

/**
 * Tarjeta de exportación del Top 10 sobre la plantilla de grafiti (9:16).
 * La marca (cabecera y pie) ya viene en la imagen; aquí solo se superpone la
 * lista en la zona de la pared de ladrillos. Render a 540x960 → html2canvas
 * scale 2 = 1080x1920 (formato historia).
 */
const RankingExportTemplate = forwardRef(({ topUsers = [], title = 'TOP 10', date }, ref) => {
  const displayDate = date
    ? format(new Date(date + 'T12:00:00'), "d 'de' MMMM yyyy", { locale: es })
    : format(new Date(), "d 'de' MMMM yyyy", { locale: es });

  const rows = topUsers.slice(0, 10);

  return (
    <div
      ref={ref}
      style={{
        width: 540,
        height: 960,
        position: 'relative',
        overflow: 'hidden',
        fontFamily: "'Inter', 'Segoe UI', sans-serif",
      }}
    >
      {/* Fondo: plantilla de grafiti */}
      <img
        src="/backgrounds/top10-template.png"
        alt=""
        style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', objectFit: 'cover' }}
      />

      {/* Contenido sobre la pared de ladrillos */}
      <div
        style={{
          position: 'absolute',
          top: '17.5%',
          bottom: '21.5%',
          left: '7%',
          right: '7%',
          display: 'flex',
          flexDirection: 'column',
        }}
      >
        {/* Título */}
        <div style={{ textAlign: 'center', marginBottom: 12 }}>
          <div
            style={{
              fontSize: 46,
              fontWeight: 900,
              fontStyle: 'italic',
              letterSpacing: '-0.02em',
              lineHeight: 1,
              color: INK,
              textTransform: 'uppercase',
              WebkitTextStroke: `1px ${INK}`,
            }}
          >
            {title}
          </div>
          <div
            style={{
              fontSize: 12,
              fontWeight: 800,
              color: RED,
              textTransform: 'uppercase',
              letterSpacing: '0.16em',
              marginTop: 5,
            }}
          >
            Mundial de Kings · {displayDate}
          </div>
        </div>

        {/* Filas — una sola línea por fila, altura fija y centrado vertical
            robusto para evitar el recorte de texto de html2canvas. */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 6, flex: 1, justifyContent: 'center' }}>
          {rows.map((u, i) => {
            const pos = i + 1;
            const s = ROW_STYLE[pos] || DEFAULT_ROW;
            return (
              <div
                key={u.id || i}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: 12,
                  height: 44,
                  background: s.bg,
                  color: s.color,
                  borderRadius: 14,
                  padding: '0 18px',
                  boxShadow: '0 3px 9px rgba(0,0,0,0.28)',
                }}
              >
                <div style={{ width: 30, flexShrink: 0, textAlign: 'center', fontWeight: 900, fontStyle: 'italic', fontSize: pos <= 3 ? 24 : 18, lineHeight: 1 }}>
                  {s.tag ?? pos}
                </div>
                {/* line-height = alto de la caja → centra el glifo y el
                    overflow:hidden recorta a 44px, nunca al texto (fix html2canvas) */}
                <div style={{ flex: 1, minWidth: 0, height: 44, lineHeight: '44px', fontWeight: 800, fontSize: 19, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                  @{u.instagram || u.full_name || '—'}
                </div>
                <div style={{ flexShrink: 0, display: 'flex', alignItems: 'baseline', gap: 4 }}>
                  <span style={{ fontWeight: 900, fontSize: 23, lineHeight: 1 }}>{u.prediction_points || 0}</span>
                  <span style={{ fontSize: 11, fontWeight: 800, opacity: 0.75 }}>PTS</span>
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
});

RankingExportTemplate.displayName = 'RankingExportTemplate';
export default RankingExportTemplate;
