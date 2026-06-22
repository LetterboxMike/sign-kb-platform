import { describe, it, expect, afterAll } from 'vitest';
import { computeElo, assignGrades, type Comparison } from '../src/elo';
import { rollupQualityGrades } from '../src/ranker';
import { getPool, closePool } from '../src/db';

// ---- Pure rating math (no DB; always runs) ----
describe('Elo rating + grade bucketing (pure)', () => {
  it('ranks a consistent winner above a consistent loser', () => {
    const comps: Comparison[] = Array.from({ length: 6 }, () => ({ record_a: 'A', record_b: 'B', winner: 'record_a' }));
    const r = computeElo(comps);
    expect(r.get('A')!.rating).toBeGreaterThan(r.get('B')!.rating);
    expect(r.get('A')!.wins).toBe(6);
    expect(r.get('A')!.games).toBe(6);
    expect(r.get('B')!.wins).toBe(0);
  });

  it('ignores skips and self-comparisons', () => {
    const r = computeElo([
      { record_a: 'A', record_b: 'B', winner: 'skip' },
      { record_a: 'A', record_b: 'A', winner: 'record_a' },
    ]);
    expect(r.get('A')?.games ?? 0).toBe(0);
  });

  it('is deterministic for the same ordered input', () => {
    const comps: Comparison[] = [
      { record_a: 'A', record_b: 'B', winner: 'record_a' },
      { record_a: 'B', record_b: 'C', winner: 'record_b' },
      { record_a: 'A', record_b: 'C', winner: 'record_a' },
    ];
    const a = computeElo(comps);
    const b = computeElo(comps);
    expect([...a.values()].map((x) => x.rating)).toEqual([...b.values()].map((x) => x.rating));
  });

  it('buckets a clear ordering into the right grades and leaves under-played records ungraded', () => {
    // A>B>C>D, each with >=2 games; E played only once -> ungraded.
    const comps: Comparison[] = [
      { record_a: 'A', record_b: 'B', winner: 'record_a' },
      { record_a: 'A', record_b: 'C', winner: 'record_a' },
      { record_a: 'A', record_b: 'D', winner: 'record_a' },
      { record_a: 'B', record_b: 'C', winner: 'record_a' },
      { record_a: 'B', record_b: 'D', winner: 'record_a' },
      { record_a: 'C', record_b: 'D', winner: 'record_a' },
      { record_a: 'E', record_b: 'A', winner: 'record_b' },
    ];
    const grades = assignGrades(computeElo(comps), { minGames: 2 });
    expect(grades.get('A')).toBe('exemplary'); // best
    expect(grades.get('D')).toBe('weak'); // worst of 4 (pct 0.75 -> weak under default cutoffs)
    expect(grades.has('E')).toBe(false); // only 1 game
    // ordering is monotonic A>=B>=C>=D
    const order = ['exemplary', 'strong', 'competent', 'weak', 'poor'];
    const idx = (id: string) => order.indexOf(grades.get(id)!);
    expect(idx('A')).toBeLessThanOrEqual(idx('B'));
    expect(idx('B')).toBeLessThanOrEqual(idx('C'));
    expect(idx('C')).toBeLessThanOrEqual(idx('D'));
  });
});

// ---- DB roll-up into signs.quality_grade (rolled back; live DB untouched) ----
const hasDb = Boolean(process.env.DATABASE_URL);
const dbSuite = hasDb ? describe : describe.skip;

dbSuite('ranker roll-up writes quality_grade (transactional, rolled back)', () => {
  afterAll(async () => {
    await closePool();
  });

  it('grades real records from synthetic comparisons, then rolls back', async () => {
    const client = await getPool().connect();
    try {
      await client.query('begin');
      const ids = (
        await client.query<{ record_id: string }>("select record_id from signs where status='live' order by record_id limit 4")
      ).rows.map((r) => r.record_id);
      if (ids.length < 4) {
        // Not enough live records to exercise the roll-up; nothing to assert.
        await client.query('rollback');
        return;
      }
      const [a, b, c, d] = ids;
      const pairs: [string, string][] = [
        [a, b], [a, c], [a, d], [b, c], [b, d], [c, d],
      ]; // a beats everyone, d loses to everyone
      for (const [x, y] of pairs) {
        await client.query("insert into taste_comparisons (record_a, record_b, winner) values ($1,$2,'record_a')", [x, y]);
      }

      const res = await rollupQualityGrades({ minGames: 2, client });
      expect(res.graded).toBe(4);

      const gradeOf = async (id: string) =>
        (await client.query<{ quality_grade: string }>('select quality_grade from signs where record_id=$1', [id]))
          .rows[0].quality_grade;
      expect(await gradeOf(a)).toBe('exemplary');
      expect(await gradeOf(d)).toBe('weak');

      // raw blob carries the grade too (system-of-record), with provenance.
      const raw = (await client.query<{ raw: any }>('select raw from signs where record_id=$1', [a])).rows[0].raw;
      expect(raw.design_assessment.quality_grade).toBe('exemplary');
      expect(raw.design_assessment.grade_provenance).toBe('ranker_elo');
    } finally {
      await client.query('rollback'); // leave the live DB exactly as it was
      client.release();
    }
  }, 120_000);
});
