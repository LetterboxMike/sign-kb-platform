/**
 * Pairwise-comparison rating for the design-taste ranker. The ranker shows two records and
 * asks "which is better?"; those choices roll up (Elo) into a consistent ordering, then bucket
 * into the schema's quality_grade enum. Pure + deterministic so the ordering is reproducible
 * (build-plan acceptance: a run of comparisons produces a stable ordering; eval #6: repeated
 * sets converge).
 */

export type Winner = 'record_a' | 'record_b' | 'skip';

export interface Comparison {
  record_a: string;
  record_b: string;
  winner: Winner;
}

export interface Rating {
  record_id: string;
  rating: number;
  games: number;
  wins: number;
}

export interface EloOptions {
  k?: number; // step size; default 24
  initial?: number; // starting rating; default 1500
}

const QUALITY_GRADES = ['exemplary', 'strong', 'competent', 'weak', 'poor'] as const;
export type QualityGrade = (typeof QUALITY_GRADES)[number];

/** Standard Elo over an ordered list of comparisons. `skip` comparisons are ignored.
 *  Deterministic given the same ordered input. */
export function computeElo(comparisons: Comparison[], opts: EloOptions = {}): Map<string, Rating> {
  const k = opts.k ?? 24;
  const initial = opts.initial ?? 1500;
  const ratings = new Map<string, Rating>();
  const ensure = (id: string): Rating => {
    let r = ratings.get(id);
    if (!r) { r = { record_id: id, rating: initial, games: 0, wins: 0 }; ratings.set(id, r); }
    return r;
  };

  for (const c of comparisons) {
    if (c.winner === 'skip') continue;
    if (!c.record_a || !c.record_b || c.record_a === c.record_b) continue;
    const a = ensure(c.record_a);
    const b = ensure(c.record_b);
    const expA = 1 / (1 + 10 ** ((b.rating - a.rating) / 400));
    const scoreA = c.winner === 'record_a' ? 1 : 0;
    a.rating += k * (scoreA - expA);
    b.rating += k * ((1 - scoreA) - (1 - expA));
    a.games++; b.games++;
    if (scoreA === 1) a.wins++; else b.wins++;
  }
  return ratings;
}

export interface GradeOptions {
  /** Minimum games before a record is graded; below this it stays null (ungraded). Default 2. */
  minGames?: number;
  /** Cumulative share boundaries for [exemplary, strong, competent, weak] (poor is the remainder).
   *  Default 10% / 30% / 70% / 90%. */
  cutoffs?: [number, number, number, number];
}

/**
 * Bucket ratings into the quality_grade enum by rank percentile among records with enough
 * games. Percentile bucketing (not absolute rating thresholds) keeps the mapping stable as
 * the rating scale drifts with more comparisons. Returns record_id -> grade (graded only).
 */
export function assignGrades(ratings: Map<string, Rating>, opts: GradeOptions = {}): Map<string, QualityGrade> {
  const minGames = opts.minGames ?? 2;
  const [c1, c2, c3, c4] = opts.cutoffs ?? [0.1, 0.3, 0.7, 0.9];
  const eligible = [...ratings.values()].filter((r) => r.games >= minGames);
  // Sort best-first; tie-break by record_id for determinism.
  eligible.sort((a, b) => b.rating - a.rating || (a.record_id < b.record_id ? -1 : 1));

  const grades = new Map<string, QualityGrade>();
  const n = eligible.length;
  if (n === 0) return grades;
  eligible.forEach((r, i) => {
    const pct = i / n; // 0 = best
    const grade: QualityGrade =
      pct < c1 ? 'exemplary' : pct < c2 ? 'strong' : pct < c3 ? 'competent' : pct < c4 ? 'weak' : 'poor';
    grades.set(r.record_id, grade);
  });
  return grades;
}
