import { randomLivePair } from '@/lib/queries';
import { comparisonCount } from './actions';
import { RankerUI } from '@/components/ranker-ui';

export const dynamic = 'force-dynamic';

export default async function RankerPage() {
  const [pair, count] = await Promise.all([randomLivePair(), comparisonCount()]);
  return (
    <div className="space-y-5">
      <div>
        <h1 className="text-xl font-semibold tracking-tight">Design-taste ranker</h1>
        <p className="text-sm text-muted-foreground">
          Pairwise comparison — pick the stronger design. Choices roll up (Elo) into a consistent quality_grade ordering,
          which seeds the canon downstream.
        </p>
      </div>
      <RankerUI initialPair={pair} initialCount={count} />
    </div>
  );
}
