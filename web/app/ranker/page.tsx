import { redirect } from 'next/navigation';
import { randomLivePair } from '@/lib/queries';
import { currentAppUser, roleAtLeast } from '@/lib/auth';
import { NotAuthorized } from '@/components/not-authorized';
import { comparisonCount } from './actions';
import { RankerUI } from '@/components/ranker-ui';

export const dynamic = 'force-dynamic';

export default async function RankerPage() {
  const me = await currentAppUser();
  if (!me) redirect('/login');
  if (!roleAtLeast(me.role, 'contributor')) return <NotAuthorized required="contributor" have={me.role} />;
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
      <RankerUI initialPair={pair} initialCount={count} canRollup={roleAtLeast(me.role, 'admin')} />
    </div>
  );
}
