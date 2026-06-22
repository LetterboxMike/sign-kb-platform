'use server';

import { query, rollupQualityGrades } from '@/lib/kb';
import { randomLivePair, type RankerCard } from '@/lib/queries';

export type Winner = 'record_a' | 'record_b' | 'skip';

/** Record one pairwise judgment and return the next pair. */
export async function submitComparison(a: string, b: string, winner: Winner): Promise<RankerCard[]> {
  await query('insert into taste_comparisons (record_a, record_b, winner) values ($1,$2,$3)', [a, b, winner]);
  return randomLivePair();
}

export async function getNextPair(): Promise<RankerCard[]> {
  return randomLivePair();
}

export async function comparisonCount(): Promise<number> {
  const r = await query<{ n: number }>('select count(*)::int as n from taste_comparisons');
  return r.rows[0].n;
}

/** Roll the comparison log up into quality_grade (Elo -> percentile buckets). */
export async function runRollup(): Promise<{ comparisons: number; graded: number; distribution: Record<string, number> }> {
  return rollupQualityGrades({ minGames: 2 });
}
