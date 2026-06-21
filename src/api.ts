import { config } from './config';
import { query } from './db';
import { embedTexts, toVectorLiteral } from './embed';

/**
 * The serving-surface query API — the published contract consumers bind to.
 * Four functions cover every view (serving-surface-spec.md):
 *   search(query, filters?, k?)         hybrid B+A — filter then rank by similarity
 *   filter(criteria, limit?)            pattern A  — exact/faceted over signs
 *   getRecord(id, { resolveRefs })      one record, optionally with materials resolved (C)
 *   resolveMaterial(ref)                pattern C  — a reference entry, standalone
 *
 * Consumers bind here, never to raw SQL and never to the files. The four-function shape
 * is stable across record-schema bumps; a bump changes the loader's column mapping, not this.
 */

// Promoted signs columns that may be filtered on (allowlist — guards the dynamic WHERE).
const FILTERABLE = new Set([
  'record_type', 'sign_category', 'sub_type', 'fabrication_family', 'illumination_method',
  'illuminated', 'mounting', 'sides', 'digital_integration', 'doc_type', 'industry_vertical',
  'design_status', 'option_set_id', 'quality_grade', 'ada_tactile', 'ada_braille', 'title_24',
  'is_program',
]);

export type FilterValue = string | number | boolean | Array<string | number | boolean>;
export type SignFilters = Record<string, FilterValue>;

export interface FilterCriteria extends Partial<Record<string, FilterValue>> {
  /** EXISTS over sign_materials.category for this record. */
  material_category?: string | string[];
  /** EXISTS over sign_components.component for this record. */
  component?: string | string[];
}

export interface SearchHit {
  record_id: string;
  record_type: string | null;
  sign_category: string | null;
  chunk_type: string;
  text: string;
  distance: number;
  raw: any;
}

export interface SignRow {
  record_id: string;
  record_type: string | null;
  sign_category: string | null;
  sub_type: string | null;
  fabrication_family: string | null;
  illumination_method: string | null;
  illuminated: boolean | null;
  mounting: string | null;
  doc_type: string | null;
  industry_vertical: string | null;
  design_status: string | null;
  quality_grade: string | null;
  raw: any;
}

export interface ReferenceEntry {
  normalized_id: string;
  company: string | null;
  category: string | null;
  product: string | null;
  knowledge: string | null;
  optical_behavior: any;
  depth: string | null;
}

export interface ResolvedMaterial {
  material_ref: string | null;
  category: string | null;
  product: string | null;
  application: string | null;
  manufacturer_normalized_id: string | null;
  reference: ReferenceEntry | null; // present when resolveRefs requested
}

export interface RecordResult {
  record: any; // the full source record (signs.raw)
  components: Array<{
    component: string | null;
    fabrication_method: string | null;
    illumination: string | null;
    material_refs: string[] | null;
    mounted_to: string | null;
  }>;
  materials: ResolvedMaterial[];
}

/** Build parameterized WHERE conditions from a criteria object against an allowlist. */
function buildConditions(criteria: Record<string, unknown> | undefined, alias: string, params: unknown[]): string[] {
  const conds: string[] = [];
  for (const [k, v] of Object.entries(criteria ?? {})) {
    if (!FILTERABLE.has(k) || v == null) continue;
    if (Array.isArray(v)) {
      if (v.length === 0) { conds.push('false'); continue; }
      const ph = v.map((val) => { params.push(val); return `$${params.length}`; });
      conds.push(`${alias}.${k} in (${ph.join(',')})`);
    } else {
      params.push(v);
      conds.push(`${alias}.${k} = $${params.length}`);
    }
  }
  return conds;
}

function existsClause(table: string, column: string, value: string | string[] | undefined, params: unknown[]): string | null {
  if (value == null) return null;
  const vals = Array.isArray(value) ? value : [value];
  if (vals.length === 0) return 'false';
  const ph = vals.map((val) => { params.push(val); return `$${params.length}`; });
  return `exists (select 1 from ${table} x where x.record_id = s.record_id and x.${column} in (${ph.join(',')}))`;
}

/**
 * Hybrid B+A: embed the query, restrict to records matching `filters`, then rank the
 * survivors by semantic similarity — one SQL query. Returns the best-matching chunk per record.
 */
export async function search(queryText: string, filters: SignFilters = {}, k = 12): Promise<SearchHit[]> {
  const [emb] = await embedTexts([queryText]);
  const dim = config.embeddingDim;
  const params: unknown[] = [toVectorLiteral(emb), k];
  const conds = buildConditions(filters, 's', params);
  const where = conds.length ? `where ${conds.join(' and ')}` : '';

  const sql = `
    select * from (
      select distinct on (s.record_id)
        s.record_id, s.record_type, s.sign_category,
        c.chunk_type, c.text,
        (c.embedding <=> $1::halfvec(${dim})) as distance,
        s.raw
      from signs s
      join kb_chunks c on c.source_id = s.record_id
      ${where}
      order by s.record_id, (c.embedding <=> $1::halfvec(${dim}))
    ) t
    order by t.distance
    limit $2`;
  const res = await query<SearchHit>(sql, params);
  return res.rows.map((r) => ({ ...r, distance: Number(r.distance) }));
}

/** Pattern A: exact/faceted filter over signs, including material/component existence. */
export async function filter(criteria: FilterCriteria = {}, limit = 100): Promise<SignRow[]> {
  const { material_category, component, ...signCriteria } = criteria;
  const params: unknown[] = [];
  const conds = buildConditions(signCriteria, 's', params);
  const matExists = existsClause('sign_materials', 'category', material_category, params);
  const compExists = existsClause('sign_components', 'component', component, params);
  if (matExists) conds.push(matExists);
  if (compExists) conds.push(compExists);
  const where = conds.length ? `where ${conds.join(' and ')}` : '';
  params.push(limit);

  const sql = `
    select s.record_id, s.record_type, s.sign_category, s.sub_type, s.fabrication_family,
           s.illumination_method, s.illuminated, s.mounting, s.doc_type, s.industry_vertical,
           s.design_status, s.quality_grade, s.raw
    from signs s
    ${where}
    order by s.record_id
    limit $${params.length}`;
  const res = await query<SignRow>(sql, params);
  return res.rows;
}

/** One record, optionally with materials resolved to their reference entries (pattern C). */
export async function getRecord(id: string, opts: { resolveRefs?: boolean } = {}): Promise<RecordResult | null> {
  const rec = await query<{ raw: any }>('select raw from signs where record_id = $1', [id]);
  if (rec.rows.length === 0) return null;

  const components = await query(
    `select component, fabrication_method, illumination, material_refs, mounted_to
     from sign_components where record_id = $1 order by id`,
    [id],
  );

  let materials: ResolvedMaterial[];
  if (opts.resolveRefs) {
    const r = await query<any>(
      `select m.material_ref, m.category, m.product, m.application, m.manufacturer_normalized_id,
              r.normalized_id, r.company, r.category as ref_category, r.product as ref_product,
              r.knowledge, r.optical_behavior, r.depth
       from sign_materials m
       left join reference r on r.normalized_id = m.manufacturer_normalized_id
       where m.record_id = $1 order by m.id`,
      [id],
    );
    materials = r.rows.map((row) => ({
      material_ref: row.material_ref,
      category: row.category,
      product: row.product,
      application: row.application,
      manufacturer_normalized_id: row.manufacturer_normalized_id,
      reference: row.normalized_id
        ? {
            normalized_id: row.normalized_id,
            company: row.company,
            category: row.ref_category,
            product: row.ref_product,
            knowledge: row.knowledge,
            optical_behavior: row.optical_behavior,
            depth: row.depth,
          }
        : null,
    }));
  } else {
    const r = await query<any>(
      `select material_ref, category, product, application, manufacturer_normalized_id
       from sign_materials where record_id = $1 order by id`,
      [id],
    );
    materials = r.rows.map((row) => ({ ...row, reference: null }));
  }

  return { record: rec.rows[0].raw, components: components.rows as any, materials };
}

/** Pattern C standalone: resolve a normalized reference id to its full reference entry. */
export async function resolveMaterial(ref: string): Promise<ReferenceEntry | null> {
  const r = await query<ReferenceEntry>(
    `select normalized_id, company, category, product, knowledge, optical_behavior, depth
     from reference where normalized_id = $1`,
    [ref],
  );
  return r.rows[0] ?? null;
}
