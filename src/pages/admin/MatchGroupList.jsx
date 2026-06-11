import { Calendar } from 'lucide-react';
import { format, parse } from 'date-fns';
import { es } from 'date-fns/locale/es';
import MatchCardItem from './MatchCardItem';

const PARSE_REF = new Date(0);

function formatDate(dateStr) {
  try {
    // Tomar solo la parte de fecha por si viene un timestamp ISO de Supabase
    const datePart = String(dateStr).split('T')[0];
    const d = parse(datePart, 'yyyy-MM-dd', PARSE_REF);
    if (isNaN(d.getTime())) return dateStr;
    return format(d, "d 'de' MMMM yyyy", { locale: es });
  } catch {
    return dateStr;
  }
}

export default function MatchGroupList({ sortedDates, groupedMatches, hasLockedMatches, results, setResults, handleStatusChange, handlePublishResult, editMatch, deleteMatch, predictionCountByMatchId }) {
  if (sortedDates.length === 0) {
    return (
      <div className="text-center py-12 space-y-3">
        <Calendar className="w-12 h-12 text-muted-foreground/30 mx-auto" />
        <p className="text-muted-foreground">No hay partidos. Crea uno o usa "Seedear 104 partidos".</p>
      </div>
    );
  }

  return sortedDates.map(dateStr => (
    <div key={dateStr}>
      <h3 className="font-display text-lg mb-2 mt-6 first:mt-0">
        {formatDate(dateStr)}
        <span className="text-sm font-sans font-normal text-muted-foreground ml-2">
          ({groupedMatches[dateStr].length} partidos)
        </span>
      </h3>
      {groupedMatches[dateStr].map(match => {
        const predCount = predictionCountByMatchId?.[match.id] || 0;
        const hasScoredPredictions = predCount > 0 && (match.status === 'live' || match.status === 'finished');
        return (
          <MatchCardItem
            key={match.id}
            match={{ ...match, _predictionCount: predCount, _hasScoredPredictions: hasScoredPredictions }}
            hasLockedMatches={hasLockedMatches}
            results={results}
            setResults={setResults}
            handleStatusChange={handleStatusChange}
            handlePublishResult={handlePublishResult}
            editMatch={editMatch}
            deleteMatch={deleteMatch}
          />
        );
      })}
    </div>
  ));
}
