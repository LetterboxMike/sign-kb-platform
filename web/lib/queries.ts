import { query } from './kb';

// Read helpers for the console's server components. The four-function query API covers search
// and record fetch; these add the small faceting/aggregate reads the UI needs. Column names are
// a fixed allowlist (never user input), so interpolating them into SQL is safe.

const FACET_COLS = ['record_type', 'sign_category', 'fabrication_family', 'illumination_method', 'mounting'] as const;
export type FacetColumn = (typeof FACET_COLS)[number];

export async function getFacets(): Promise<Record<FacetColumn, string[]>> {
  const out = {} as Record<FacetColumn, string[]>;
  for (const c of FACET_COLS) {
    const r = await query<{ v: string }>(
      `select distinct ${c} as v from signs where status = 'live' and ${c} is not null order by 1`,
    );
    out[c] = r.rows.map((x) => x.v);
  }
  return out;
}

export interface CorpusStats {
  signs: number;
  graded: number;
  categories: number;
  references: number;
}

export async function corpusStats(): Promise<CorpusStats> {
  const r = await query<CorpusStats>(
    `select
       (select count(*) from signs where status='live')::int as signs,
       (select count(*) from signs where status='live' and quality_grade is not null)::int as graded,
       (select count(distinct sign_category) from signs where status='live' and sign_category is not null)::int as categories,
       (select count(*) from reference)::int as references`,
  );
  return r.rows[0];
}

export interface RankerCard {
  record_id: string;
  sign_category: string | null;
  sub_type: string | null;
  record_type: string;
  summary: string | null;
}

export async function randomLivePair(): Promise<RankerCard[]> {
  const r = await query<{
    record_id: string;
    sign_category: string | null;
    sub_type: string | null;
    record_type: string;
    raw: any;
  }>("select record_id, sign_category, sub_type, record_type, raw from signs where status='live' order by random() limit 2");
  return r.rows.map((row) => ({
    record_id: row.record_id,
    sign_category: row.sign_category,
    sub_type: row.sub_type,
    record_type: row.record_type,
    summary: row.raw?.knowledge?.plain_language_summary ?? null,
  }));
}

export async function gradeDistribution(): Promise<{ grade: string; n: number }[]> {
  const r = await query<{ grade: string; n: number }>(
    "select coalesce(quality_grade, 'ungraded') as grade, count(*)::int as n from signs where status='live' group by 1 order by 2 desc",
  );
  return r.rows;
}
