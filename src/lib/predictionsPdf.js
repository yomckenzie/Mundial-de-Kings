import { jsPDF } from 'jspdf';
import autoTable from 'jspdf-autotable';

const NAVY = [31, 41, 55];
const slug = (s) => String(s || '').replace(/[^\w]+/g, '').slice(0, 30);

// Fila de métricas tipo "tarjetas" (etiquetas arriba, valores abajo).
function metricsLine(doc, startY, metrics) {
  autoTable(doc, {
    startY,
    head: [metrics.map(m => m.label)],
    body: [metrics.map(m => String(m.value))],
    theme: 'grid',
    headStyles: { fillColor: [245, 247, 250], textColor: 90, fontStyle: 'bold', halign: 'center' },
    bodyStyles: { halign: 'center', fontStyle: 'bold', textColor: NAVY, fontSize: 13 },
    margin: { left: 14, right: 14 },
  });
  return doc.lastAutoTable.finalY;
}

function matchTable(doc, startY, title, rows) {
  doc.setFontSize(13);
  doc.setTextColor(...NAVY);
  doc.text(title, 14, startY);
  autoTable(doc, {
    startY: startY + 3,
    head: [['@Instagram', 'Nombre', 'Correo', 'Pron.', 'Estado', 'Pts']],
    body: rows.map(r => [r.instagram ? '@' + r.instagram : '', r.name, r.email, r.pred, r.status, r.points]),
    styles: { fontSize: 8, cellPadding: 1.5 },
    headStyles: { fillColor: NAVY, textColor: 255 },
    margin: { left: 14, right: 14 },
  });
  return doc.lastAutoTable.finalY;
}

// PDF de un solo partido.
export function exportMatchPdf(matchReport) {
  const doc = new jsPDF();
  const { match, resultText, rows, stats } = matchReport;
  doc.setFontSize(16);
  doc.setTextColor(...NAVY);
  doc.text(`Pronósticos: ${match.team1} vs ${match.team2} (${resultText})`, 14, 18);
  const y = metricsLine(doc, 24, [
    { label: 'Participantes', value: stats.participants },
    { label: 'Aciertos', value: stats.hits },
    { label: 'Efectividad', value: stats.effectiveness },
  ]);
  matchTable(doc, y + 8, 'Detalle por usuario', rows);
  doc.save(`pronosticos_${slug(match.team1)}_vs_${slug(match.team2)}.pdf`);
}

// PDF total: métricas globales + tabla por cada partido + tabla de posiciones.
export function exportTotalPdf({ globalStats, matchReports, standings }) {
  const doc = new jsPDF();
  doc.setFontSize(18);
  doc.setTextColor(...NAVY);
  doc.text('Reporte de Pronósticos', 14, 18);
  let y = metricsLine(doc, 26, [
    { label: 'Partidos', value: globalStats.totalMatches },
    { label: 'Participantes', value: globalStats.participants },
    { label: 'Aciertos', value: globalStats.hits },
    { label: 'Efectividad', value: globalStats.effectiveness },
  ]);

  for (const mr of matchReports) {
    if (y > 240) { doc.addPage(); y = 18; }
    y = matchTable(doc, y + 10, `Partido: ${mr.match.team1} vs ${mr.match.team2} (${mr.resultText})`, mr.rows);
  }

  doc.addPage();
  doc.setFontSize(15);
  doc.setTextColor(...NAVY);
  doc.text('Tabla de Posiciones Final', 14, 18);
  autoTable(doc, {
    startY: 24,
    head: [['#', '@Instagram', 'Nombre', 'Correo', 'Aciertos', 'Puntos']],
    body: standings.map(s => [s.rank, s.instagram ? '@' + s.instagram : '', s.name, s.email, `${s.hits}/${s.total}`, `${s.points} pts`]),
    styles: { fontSize: 8, cellPadding: 1.5 },
    headStyles: { fillColor: NAVY, textColor: 255 },
    margin: { left: 14, right: 14 },
  });

  doc.save('reporte_pronosticos.pdf');
}
