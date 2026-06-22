'use server';

import { query, rollupQualityGrades } from '@/lib/kb';
import { randomLivePair, type RankerCard } from '@/lib/queries';
import { requireAdmin, requireContributor } from '@/lib/auth';

export type Winner = 'record_a' | 'record_b' | 'skip';

/** Record one pairwise judgment and return the next pair. Attributed to the judging user. */
export async function submitComparison(a: string, b: string, winner: Winner): Promise<RankerCard[]> {
  const me = await requireContributor();
  await query('insert into taste_comparisons (record_a, record_b, winner, judge) values ($1,$2,$3,$4)', [a, b, winner, me.id]);
  return randomLivePair();
}

export async function comparisonCount(): Promise<number> {
  const r = await query<{ n: number }>('select count(*)::int as n from taste_comparisons');
  return r.rows[0].n;
}

/** Roll the comparison log up into quality_grade (Elo -> percentile buckets). Admin-only: it
 *  mutates the live corpus (writes quality_grade onto records). */
export async function runRollup(): Promise<{ comparisons: number; graded: number; distribution: Record<string, number> }> {
  await requireAdmin();
  return rollupQualityGrades({ minGames: 2 });
}
