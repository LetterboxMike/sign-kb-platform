import crypto from 'node:crypto';

// Loose typing: records are validated by the gate before mapping; here we project fields.
type Json = any;

function get(obj: Json, dotted: string): Json {
  return dotted.split('.').reduce((o, k) => (o == null ? undefined : o[k]), obj);
}

/** Coerce a value to a number for a promoted numeric column. Non-scalar-numeric values
 *  (e.g. a range like "5.7-10.2") become null here but remain queryable via `raw`. */
function numOrNull(v: Json): number | null {
  if (typeof v === 'number') return Number.isFinite(v) ? v : null;
  if (typeof v === 'string') {
    const t = v.trim();
    if (t === '') return null;
    const n = Number(t);
    return Number.isFinite(n) ? n : null;
  }
  return null;
}

/** Stable, key-sorted JSON so content_hash is deterministic regardless of key order. */
export function canonicalize(value: Json): string {
  return JSON.stringify(sortKeys(value));
}

function sortKeys(v: Json): Json {
  if (Array.isArray(v)) return v.map(sortKeys);
  if (v && typeof v === 'object') {
    return Object.keys(v)
      .sort()
      .reduce((acc: Json, k) => {
        acc[k] = sortKeys(v[k]);
        return acc;
      }, {});
  }
  return v;
}

export function contentHash(record: Json): string {
  return crypto.createHash('sha256').update(canonicalize(record)).digest('hex');
}

export interface SignRow {
  record_id: string;
  record_type: string;
  sign_category: string | null;
  sub_type: string | null;
  fabrication_family: string | null;
  illumination_method: string | null;
  illuminated: boolean | null;
  mounting: string | null;
  sides: number | null;
  digital_integration: boolean | null;
  doc_type: string | null;
  industry_vertical: string | null;
  design_status: string | null;
  option_set_id: string | null;
  quality_grade: string | null;
  width_in: number | null;
  height_in: number | null;
  area_sqft: number | null;
  ada_tactile: boolean | null;
  ada_braille: boolean | null;
  title_24: boolean | null;
  is_program: boolean | null;
  raw: Json;
  content_hash: string;
  schema_version: string | null;
}

export function mapSignRow(rec: Json): SignRow {
  const dims = rec.dimensions ?? {};
  return {
    record_id: rec.record_id,
    record_type: rec.record_type,
    sign_category: get(rec, 'classification.sign_category') ?? null,
    sub_type: get(rec, 'classification.sub_type') ?? null,
    fabrication_family: get(rec, 'classification.fabrication_family') ?? null,
    illumination_method: get(rec, 'classification.illumination_method') ?? null,
    illuminated: get(rec, 'classification.illuminated') ?? null,
    mounting: get(rec, 'classification.mounting') ?? null,
    sides: numOrNull(get(rec, 'classification.sides')),
    digital_integration: get(rec, 'classification.digital_integration') ?? null,
    doc_type: get(rec, 'source.doc_type') ?? null,
    industry_vertical: get(rec, 'context.industry_vertical') ?? null,
    design_status: rec.design_status ?? null,
    option_set_id: rec.option_set_id ?? null,
    quality_grade: get(rec, 'design_assessment.quality_grade') ?? null,
    width_in: numOrNull(dims.overall_width_in ?? dims.width_in),
    height_in: numOrNull(dims.overall_height_in ?? dims.height_in),
    area_sqft: numOrNull(dims.area_sqft),
    ada_tactile: get(rec, 'compliance.ada.tactile') ?? null,
    ada_braille: get(rec, 'compliance.ada.braille') ?? null,
    title_24: get(rec, 'compliance.title_24') ?? null,
    is_program: get(rec, 'program_model.is_program') ?? null,
    raw: rec,
    content_hash: contentHash(rec),
    schema_version: rec.schema_version ?? null,
  };
}

export interface ComponentRow {
  record_id: string;
  component: string | null;
  fabrication_method: string | null;
  illumination: string | null;
  material_refs: string[] | null;
  mounted_to: string | null;
}

export function mapComponents(rec: Json): ComponentRow[] {
  const structure = Array.isArray(rec.structure) ? rec.structure : [];
  return structure.map((s: Json) => ({
    record_id: rec.record_id,
    component: s.component ?? null,
    fabrication_method: s.fabrication_method ?? null,
    illumination: s.illumination ?? null,
    material_refs: Array.isArray(s.material_refs) ? s.material_refs : null,
    mounted_to: s.mounted_to ?? null,
  }));
}

export interface MaterialRow {
  record_id: string;
  material_ref: string | null;
  category: string | null;
  product: string | null;
  application: string | null;
  manufacturer_normalized_id: string | null;
}

export function mapMaterials(rec: Json): MaterialRow[] {
  const manifest = Array.isArray(rec.materials_manifest) ? rec.materials_manifest : [];
  return manifest.map((m: Json) => ({
    record_id: rec.record_id,
    material_ref: m.ref ?? null,
    category: m.category ?? null,
    product: m.product ?? null,
    application: m.application ?? null,
    manufacturer_normalized_id: m.manufacturer_normalized_id ?? null,
  }));
}

export interface ReferenceRow {
  normalized_id: string;
  company: string | null;
  category: string | null;
  product: string | null;
  knowledge: string | null;
  optical_behavior: Json;
  depth: string;
}

/** Map the manufacturer-reference.json `entries[]` (manufacturers + components) into the
 *  `reference` table. company is set for manufacturers, product for components. */
export function mapReferenceEntries(refFile: Json): ReferenceRow[] {
  const entries = Array.isArray(refFile.entries) ? refFile.entries : [];
  return entries.map((e: Json) => {
    const isManufacturer = e.type === 'manufacturer';
    const knowledge = e.summary ?? e.spec ?? e.used_for ?? null;
    const depth =
      typeof e.depth === 'string' && e.depth.includes('stub')
        ? 'stub'
        : e.provenance === 'researched'
          ? 'researched'
          : 'stub';
    return {
      normalized_id: e.id,
      company: isManufacturer ? (e.name ?? null) : null,
      category: e.category ?? null,
      product: isManufacturer ? null : (e.name ?? null),
      knowledge,
      optical_behavior: e.optical_behavior ?? null,
      depth,
    };
  });
}
