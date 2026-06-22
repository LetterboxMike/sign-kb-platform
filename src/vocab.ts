import { query } from './db';
import { writeRecord, type RecordStatus } from './write';
import { setPath } from './correct';
import schema from '../sign-record.schema.json';

/**
 * Vocabulary review. Extraction flags genuinely novel enum values as 'proposed_new_term' (a valid
 * enum escape hatch) rather than inventing a synonym. This surfaces every occurrence so an admin
 * can resolve it to a real enum value. Resolving writes through the schema gate (writeRecord), so
 * an invalid value is rejected — a truly new term needs a schema enum addition (a manual decision).
 */

const CLASS_FIELDS: { col: string; path: string; label: string; leaf: string }[] = [
  { col: 'sign_category', path: 'classification.sign_category', label: 'sign_category', leaf: 'sign_category' },
  { col: 'illumination_method', path: 'classification.illumination_method', label: 'illumination_method', leaf: 'illumination_method' },
  { col: 'fabrication_family', path: 'classification.fabrication_family', label: 'fabrication_family', leaf: 'fabrication_family' },
  { col: 'mounting', path: 'classification.mounting', label: 'mounting', leaf: 'mounting' },
];

/** Collect every enum array declared under a property named `leaf` anywhere in the schema
 *  (it's a discriminated union, so a field can appear in more than one branch), unioned and with
 *  the 'proposed_new_term' escape hatch removed. Drives the resolve dropdown. */
export function enumValuesFor(leaf: string): string[] {
  const out = new Set<string>();
  const walk = (node: any, keyName?: string) => {
    if (!node || typeof node !== 'object') return;
    if (keyName === leaf && Array.isArray(node.enum)) {
      for (const v of node.enum) if (typeof v === 'string' && v !== 'proposed_new_term') out.add(v);
    }
    for (const [k, v] of Object.entries(node)) {
      if (v && typeof v === 'object') walk(v, k);
    }
  };
  walk(schema as any);
  return [...out].sort();
}

export interface ProposedTerm {
  record_id: string;
  status: string;
  scope: 'classification' | 'material';
  field: string; // display label
  leaf: string; // schema property name, for enum lookup
  path: string | null; // raw dot-path for resolution (now set for materials too, with array index)
  category: string | null; // record category for context
  context: string | null; // extra context, e.g. the material's product/ref label
  options: string[]; // valid enum values to choose from
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
        out.push({
          record_id: row.record_id,
          status: row.status,
          scope: 'classification',
          field: f.label,
          leaf: f.leaf,
          path: f.path,
          category: row.sign_category,
          context: null,
          options: enumValuesFor(f.leaf),
        });
      }
    }
  }

  // Material-level terms live inside the raw `materials_manifest` array. Read the raw record so we
  // can compute the exact array-index dot-path (e.g. materials_manifest.2.category) the resolver
  // needs, plus a human label for context.
  const m = await query<{ record_id: string; status: string; raw: any; sign_category: string | null }>(
    `select s.record_id, s.status, s.raw, s.sign_category from signs s
     where exists (
       select 1 from sign_materials x
       where x.record_id = s.record_id and (x.category = 'proposed_new_term' or x.application = 'proposed_new_term')
     )`,
  );
  for (const row of m.rows) {
    const manifest: any[] = Array.isArray(row.raw?.materials_manifest) ? row.raw.materials_manifest : [];
    manifest.forEach((mat, i) => {
      const label = mat?.product ?? mat?.ref ?? mat?.material_ref ?? `material ${i + 1}`;
      for (const leaf of ['category', 'application'] as const) {
        if (mat?.[leaf] === 'proposed_new_term') {
          out.push({
            record_id: row.record_id,
            status: row.status,
            scope: 'material',
            field: `material.${leaf}`,
            leaf,
            path: `materials_manifest.${i}.${leaf}`,
            category: row.sign_category,
            context: String(label),
            options: enumValuesFor(leaf),
          });
        }
      }
    });
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
