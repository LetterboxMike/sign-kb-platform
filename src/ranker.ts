import type { PoolClient } from 'pg';
import { withTransaction } from './db';
import { contentHash } from './map';
import { computeElo, assignGrades, type Comparison } from './elo';

/**
 * Roll up taste_comparisons into quality_grade. Reads the comparison log, computes Elo, buckets
 * by percentile, and writes the grade to the system of record: the `raw` blob
 * (design_assessment.quality_grade + grade_provenance), the promoted `quality_grade` column, and
 * a recomputed content_hash — all in one transaction. quality_grade is not part of the embedded
 * chunk text, so no re-embed is needed.
 *
 * Note: grading mutates the source-of-record. Run `npm run export` afterward to refresh the JSON
 * portability layer; a rebuild-from-files must be from a current export or it will revert grades.
 */

export interface RollupResult {
  comparisons: number;
  graded: number;
  distribution: Record<string, number>;
}

export async function rollupQualityGrades(opts: { minGames?: number; client?: PoolClient } = {}): Promise<RollupResult> {
  const run = async (c: PoolClient): Promise<RollupResult> => {
    const comps = await c.query<Comparison>(
      'select record_a, record_b, winner from taste_comparisons order by created_at, id',
    );
    const ratings = computeElo(comps.rows);
    const grades = assignGrades(ratings, { minGames: opts.minGames });

    const distribution: Record<string, number> = {};
    let graded = 0;
    for (const [recordId, grade] of grades) {
      const res = await c.query<{ raw: any }>('select raw from signs where record_id = $1', [recordId]);
      if (res.rows.length === 0) continue;
      const raw = res.rows[0].raw;
      raw.design_assessment = raw.design_assessment ?? {};
      raw.design_assessment.quality_grade = grade;
      raw.design_assessment.grade_provenance = 'ranker_elo';
      await c.query('update signs set quality_grade = $2, raw = $3::jsonb, content_hash = $4 where record_id = $1', [
        recordId,
        grade,
        JSON.stringify(raw),
        contentHash(raw),
      ]);
      graded++;
      distribution[grade] = (distribution[grade] ?? 0) + 1;
    }
    return { comparisons: comps.rows.length, graded, distribution };
  };
  if (opts.client) return run(opts.client);
  return withTransaction(run);
}
