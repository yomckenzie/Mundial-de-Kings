// Helpers compartidos entre MatchCard.jsx y otros componentes.
// Extraídos de MatchCard.jsx para permitir Fast Refresh (reglas de react-doctor).
import { parse, format } from 'date-fns';
import { es } from 'date-fns/locale';

// Referencia fija para parsear fechas en hora LOCAL (igual que el panel admin
// en MatchGroupList.jsx). Evita el desfase de zona horaria que ocurre al usar
// new Date('yyyy-MM-dd'), que interpreta la fecha como UTC y resta el offset
// local (mostrando un día antes en zonas UTC negativas como Panamá, UTC-5).
const PARSE_REF = new Date(0);

export const formatMatchDate = (dateStr) => {
  if (!dateStr) return '';
  // Tomar solo la parte de fecha por si viene un timestamp ISO de Supabase
  const datePart = String(dateStr).split('T')[0];
  const d = parse(datePart, 'yyyy-MM-dd', PARSE_REF);
  if (isNaN(d.getTime())) return dateStr;
  return format(d, "d 'de' MMMM", { locale: es });
};

export const statusMap = {
  pending: { label: 'Próximamente', class: 'bg-muted text-foreground/70' },
  open: { label: 'Abierto', class: 'bg-emerald-100 text-emerald-800 dark:bg-emerald-900/40 dark:text-emerald-300' },
  live: { label: 'EN VIVO', class: 'bg-red-600 text-white animate-pulse' },
  closed: { label: 'Cerrado', class: 'bg-secondary/50 text-secondary-foreground' },
  finished: { label: 'Finalizado', class: 'bg-muted text-foreground/70' },
};

export const getMatchDate = (match_date, match_time) => {
  // Soporta formato ISO (de Supabase) y formato simple yyyy-MM-dd
  if (!match_date || !match_time) return null;
  const datePart = match_date.split('T')[0];
  const [year, month, day] = datePart.split('-').map(Number);
  const [hour, minute] = match_time.split(':').map(Number);
  return new Date(year, month - 1, day, hour, minute, 0);
};

// Forma vacía del formulario 3-pasos (Task 5 v2). Cada pick es independiente:
//   - pred_winner: 'team1' | 'team2' | null (sin Empate en v2)
//   - pred_method: '90' | 'et' | 'pen' | null
//   - pred_score_team1 / pred_score_team2: marcador final (req. si method es '90' o 'et')
//   - pred_pen_team1 / pred_pen_team2: penales (req. si method es 'pen')
//   Los scores arrancan como '' (string vacío) porque son inputs controlados
//   de tipo number; handleSubmit (Task 6) los convierte a Number al enviar.
export const EMPTY_FORM = {
  pred_winner: null,
  pred_method: null,
  pred_score_team1: '',  // placeholder visual "0" en el input; '' si el usuario no escribió
  pred_score_team2: '',
  pred_pen_team1: '',
  pred_pen_team2: '',
};

const VISIBILITY_WINDOW_HOURS = 48; // Partido aparece en la lista
const PREDICTION_WINDOW_HOURS = 24; // Usuario puede enviar pronóstico

export const getTimeUntilOpen = (match_date, match_time) => {
  const matchDateTime = getMatchDate(match_date, match_time);
  if (!matchDateTime) return null;
  const openFrom = new Date(matchDateTime.getTime() - PREDICTION_WINDOW_HOURS * 60 * 60 * 1000);
  const now = new Date();
  const diff = openFrom - now;
  if (diff <= 0) return null;
  const hours = Math.floor(diff / (1000 * 60 * 60));
  const minutes = Math.floor((diff % (1000 * 60 * 60)) / (1000 * 60));
  return hours > 0 ? `${hours}h ${minutes}m` : `${minutes}m`;
};

export const isWithinVisibilityWindow = (match) => {
  // Si el admin lo abrió manualmente, se muestra siempre
  if (match.status === 'open') return true;
  const matchDateTime = getMatchDate(match.match_date, match.match_time);
  if (!matchDateTime) return false;
  const visibleFrom = new Date(matchDateTime.getTime() - VISIBILITY_WINDOW_HOURS * 60 * 60 * 1000);
  const now = new Date();
  return now >= visibleFrom && now < matchDateTime;
};

export const isMatchOpenForPredictions = (match) => {
  if (match.status !== 'pending' && match.status !== 'open') return false;
  // Si el admin lo puso como 'open', se habilita manualmente sin importar la ventana de 24h
  if (match.status === 'open') return true;
  const matchDateTime = getMatchDate(match.match_date, match.match_time);
  if (!matchDateTime) return false;
  const openFrom = new Date(matchDateTime.getTime() - PREDICTION_WINDOW_HOURS * 60 * 60 * 1000);
  const now = new Date();
  return now >= openFrom && now < matchDateTime;
};
