import { lazy, Suspense } from 'react';
import { Card, CardContent } from '@/components/ui/card';

const DailyWinnersChartLazy = lazy(() => import('./DailyWinnersChart'));
const DailyRegistrationsChartLazy = lazy(() => import('./DailyRegistrationsChart'));
const TopUsersChartLazy = lazy(() => import('./TopUsersChart'));
const MatchParticipationChartLazy = lazy(() => import('./MatchParticipationChart'));

function ChartSkeleton() {
  return (
    <Card>
      <CardContent className="h-[260px] flex items-center justify-center text-muted-foreground text-sm">
        Cargando gráfica…
      </CardContent>
    </Card>
  );
}

export const DailyWinnersChart = (props) => (
  <Suspense fallback={<ChartSkeleton />}><DailyWinnersChartLazy {...props} /></Suspense>
);
export const DailyRegistrationsChart = (props) => (
  <Suspense fallback={<ChartSkeleton />}><DailyRegistrationsChartLazy {...props} /></Suspense>
);
export const TopUsersChart = (props) => (
  <Suspense fallback={<ChartSkeleton />}><TopUsersChartLazy {...props} /></Suspense>
);
export const MatchParticipationChart = (props) => (
  <Suspense fallback={<ChartSkeleton />}><MatchParticipationChartLazy {...props} /></Suspense>
);
