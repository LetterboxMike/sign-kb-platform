import { query } from './db';
import { writeRecord, type RecordStatus } from './write';
import { setPath } from './correct';

/**
 * Vocabulary review. Extraction flags genuinely novel enum values as 'proposed_new_term' (a valid
 * enum escape hatch) rather than inventing a synonym. This surfaces every occurrence so an admin
 * can resolve it to a real enum value. Resolving writes through the schema gate (writeRecord), so
 * an invalid value is rejected — a truly new term needs a schema enum addition (a manual decision).
 */

const CLASS_FIELDS: { col: string; path: string; label: string }[] = [
  { col: 'sign_category', path: 'classification.sign_category', label: 'sign_category' },
  { col: 'illumination_method', path: 'classification.illumination_method', label: 'illumination_method' },
  { col: 'fabrication_family', path: 'classification.fabrication_family', label: 'fabrication_family' },
  { col: 'mounting', path: 'classification.mounting', label: 'mounting' },
];

export interface ProposedTerm {
  record_id: string;
  status: string;
  scope: 'classification' | 'material';
  field: string; // display label
  path: string | null; // raw dot-path for resolution (null when not directly resolvable, e.g. materials array)
  category: string | null; // record category for context
}

export async function listProposedTerms(): Promise<ProposedTerm[]> {
  const out: ProposedTerm[] = [];
  const cond = CLASS_FIELDS.map((f) => `${f.col} = 'proposed_new_term'`).join(' or ');
  const r = await query<any>(
    `select record_id, status, sign_category, illumination_method, fabrication_family, mounting from signs where ${cond}`,
  );
  for (const row of r.rows) {
    for (const f of CLASS_FIELDS) {
      if (row[f.col] === 'proposed_new_term') {
        out.push({ record_id: row.record_id, status: row.status, scope: 'classification', field: f.label, path: f.path, category: row.sign_category });
      }
    }
  }
  const m = await query<{ record_id: string; category: string | null; application: string | null }>(
    `select distinct record_id, category, application from sign_materials
     where category = 'proposed_new_term' or application = 'proposed_new_term'`,
  );
  for (const row of m.rows) {
    if (row.category === 'proposed_new_term') out.push({ record_id: row.record_id, status: '', scope: 'material', field: 'material.category', path: null, category: null });
    if (row.application === 'proposed_new_term') out.push({ record_id: row.record_id, status: '', scope: 'material', field: 'material.application', path: null, category: null });
  }
  return out;
}

/** Resolve a classification-level proposed_new_term to a real enum value (re-validated on write). */
export async function resolveProposedTerm(recordId: string, path: string, value: string): Promise<void> {
  const r = await query<{ raw: any; status: RecordStatus }>('select raw, status from signs where record_id = $1', [recordId]);
  if (r.rows.length === 0) throw new Error('record not found');
  const raw = structuredClone(r.rows[0].raw);
  setPath(raw, path, value);
  await writeRecord(raw, { status: r.rows[0].status }); // schema gate rejects a non-enum value
}
