import fs from 'node:fs';
import path from 'node:path';
import type { PoolClient } from 'pg';
import { config } from './config';
import { withTransaction, closePool } from './db';
import { validateRecord } from './validate';
import {
  mapSignRow,
  mapComponents,
  mapMaterials,
  mapReferenceEntries,
} from './map';

export interface LoadSummary {
  validRecords: number;
  rejected: { file: string; errors: string[] }[];
  referenceRows: number;
  inserted: number;
  updated: number;
  unchanged: number;
  deleted: number;
  nulledMaterialRefs: number;
}

export interface LoadOptions {
  rebuild?: boolean;
  recordsDir?: string;
  referenceFile?: string;
}

function readJson(file: string): any {
  return JSON.parse(fs.readFileSync(file, 'utf8'));
}

const SIGNS_COLUMNS = [
  'record_id', 'record_type', 'sign_category', 'sub_type', 'fabrication_family',
  'illumination_method', 'illuminated', 'mounting', 'sides', 'digital_integration',
  'doc_type', 'industry_vertical', 'design_status', 'option_set_id', 'quality_grade',
  'width_in', 'height_in', 'area_sqft', 'ada_tactile', 'ada_braille', 'title_24',
  'is_program', 'raw', 'content_hash', 'schema_version',
] as const;

const MAX_PARAMS = 60_000;

/** Chunked multi-row insert. jsonb columns are JSON-stringified and cast; everything else
 *  (including text[]) is bound directly. */
async function insertRows(
  c: PoolClient,
  table: string,
  columns: readonly string[],
  rows: Record<string, unknown>[],
  opts: { onConflict?: string; jsonb?: string[] } = {},
): Promise<void> {
  if (rows.length === 0) return;
  const jsonb = new Set(opts.jsonb ?? []);
  const numCols = columns.length;
  const chunkSize = Math.max(1, Math.floor(MAX_PARAMS / numCols));

  for (let i = 0; i < rows.length; i += chunkSize) {
    const chunk = rows.slice(i, i + chunkSize);
    const values: unknown[] = [];
    const tuples = chunk.map((row, r) => {
      const placeholders = columns.map((col, ci) => {
        const idx = r * numCols + ci + 1;
        return jsonb.has(col) ? `$${idx}::jsonb` : `$${idx}`;
      });
      for (const col of columns) {
        const v = (row as any)[col];
        values.push(jsonb.has(col) ? (v == null ? null : JSON.stringify(v)) : v);
      }
      return `(${placeholders.join(',')})`;
    });
    const sql =
      `insert into ${table} (${columns.join(',')}) values ${tuples.join(',')} ` +
      (opts.onConflict ?? '');
    await c.query(sql, values);
  }
}

export async function load(opts: LoadOptions = {}): Promise<LoadSummary> {
  const rebuild = opts.rebuild ?? false;
  const recordsDir = opts.recordsDir ?? config.recordsDir;
  const referenceFile = opts.referenceFile ?? config.referenceFile;

  // 1. Reference (FK target) — mapped first.
  const refRows = mapReferenceEntries(readJson(referenceFile));
  const refIds = new Set(refRows.map((r) => r.normalized_id));

  // 2. Read + validate every record. Invalid records are rejected at the gate.
  const files = fs.readdirSync(recordsDir).filter((f) => f.endsWith('.json')).sort();
  const valid: any[] = [];
  const rejected: { file: string; errors: string[] }[] = [];
  for (const f of files) {
    let rec: any;
    try {
      rec = readJson(path.join(recordsDir, f));
    } catch (e) {
      rejected.push({ file: f, errors: [`unreadable JSON: ${(e as Error).message}`] });
      continue;
    }
    const { valid: ok, errors } = validateRecord(rec);
    if (!ok) {
      rejected.push({ file: f, errors });
      continue;
    }
    valid.push(rec);
  }

  const summary: LoadSummary = {
    validRecords: valid.length,
    rejected,
    referenceRows: refRows.length,
    inserted: 0,
    updated: 0,
    unchanged: 0,
    deleted: 0,
    nulledMaterialRefs: 0,
  };

  await withTransaction(async (c) => {
    if (rebuild) {
      await c.query('truncate table sign_materials, sign_components, signs restart identity cascade');
      await c.query('truncate table reference cascade');
    }

    // Reference upsert first so material FKs resolve. Change-guarded so unchanged rows are untouched.
    await insertRows(c, 'reference', ['normalized_id', 'company', 'category', 'product', 'knowledge', 'optical_behavior', 'depth'], refRows as any, {
      jsonb: ['optical_behavior'],
      onConflict:
        `on conflict (normalized_id) do update set
           company = excluded.company, category = excluded.category, product = excluded.product,
           knowledge = excluded.knowledge, optical_behavior = excluded.optical_behavior, depth = excluded.depth
         where (reference.company, reference.category, reference.product, reference.knowledge, reference.optical_behavior, reference.depth)
               is distinct from
               (excluded.company, excluded.category, excluded.product, excluded.knowledge, excluded.optical_behavior, excluded.depth)`,
    });

    // Existing hashes drive incremental sync.
    const existing = new Map<string, string>();
    const res = await c.query<{ record_id: string; content_hash: string }>(
      'select record_id, content_hash from signs',
    );
    for (const row of res.rows) existing.set(row.record_id, row.content_hash);

    // Partition into new / changed / unchanged.
    const desiredIds = new Set<string>();
    const toWrite: any[] = [];
    const updatedIds: string[] = [];
    for (const rec of valid) {
      const row = mapSignRow(rec);
      desiredIds.add(row.record_id);
      const prev = existing.get(row.record_id);
      if (prev === row.content_hash) {
        summary.unchanged++;
        continue;
      }
      if (prev === undefined) summary.inserted++;
      else {
        summary.updated++;
        updatedIds.push(row.record_id);
      }
      toWrite.push(rec);
    }

    if (toWrite.length > 0) {
      // Replace child rows for changed records (rebuild already truncated).
      if (updatedIds.length > 0) {
        await c.query('delete from sign_components where record_id = any($1::text[])', [updatedIds]);
        await c.query('delete from sign_materials where record_id = any($1::text[])', [updatedIds]);
      }

      const updateSet = SIGNS_COLUMNS.filter((col) => col !== 'record_id')
        .map((col) => `${col} = excluded.${col}`)
        .join(', ');
      const signRows = toWrite.map((rec) => mapSignRow(rec));
      await insertRows(c, 'signs', SIGNS_COLUMNS, signRows as any, {
        jsonb: ['raw'],
        onConflict: `on conflict (record_id) do update set ${updateSet}`,
      });

      const componentRows = toWrite.flatMap((rec) => mapComponents(rec));
      await insertRows(
        c,
        'sign_components',
        ['record_id', 'component', 'fabrication_method', 'illumination', 'material_refs', 'mounted_to'],
        componentRows as any,
      );

      const materialRows = toWrite.flatMap((rec) =>
        mapMaterials(rec).map((mat) => {
          let mfr = mat.manufacturer_normalized_id;
          if (mfr && !refIds.has(mfr)) {
            summary.nulledMaterialRefs++;
            mfr = null; // resilient FK: keep the material row, drop the dangling reference
          }
          return { ...mat, manufacturer_normalized_id: mfr };
        }),
      );
      await insertRows(
        c,
        'sign_materials',
        ['record_id', 'material_ref', 'category', 'product', 'application', 'manufacturer_normalized_id'],
        materialRows as any,
      );
    }

    // Incremental projection: drop signs whose source record left the corpus.
    if (!rebuild) {
      const orphans = [...existing.keys()].filter((id) => !desiredIds.has(id));
      if (orphans.length > 0) {
        await c.query('delete from signs where record_id = any($1::text[])', [orphans]); // cascades children
        summary.deleted = orphans.length;
      }
    }
  });

  return summary;
}

function printSummary(s: LoadSummary, rebuild: boolean): void {
  console.log(`\nSign KB loader — ${rebuild ? 'full rebuild' : 'incremental sync'}`);
  console.log(`  reference rows mapped : ${s.referenceRows}`);
  console.log(`  valid records         : ${s.validRecords}`);
  console.log(`  rejected (gate)       : ${s.rejected.length}`);
  console.log(`  inserted              : ${s.inserted}`);
  console.log(`  updated               : ${s.updated}`);
  console.log(`  unchanged             : ${s.unchanged}`);
  console.log(`  deleted (orphans)     : ${s.deleted}`);
  console.log(`  nulled material FKs   : ${s.nulledMaterialRefs}`);
  if (s.rejected.length) {
    console.log('\n  Rejected records:');
    for (const r of s.rejected) {
      console.log(`    [FAIL] ${r.file}`);
      for (const e of r.errors.slice(0, 5)) console.log(`        ${e}`);
    }
    fs.writeFileSync(
      path.join(process.cwd(), 'load-reject-report.json'),
      JSON.stringify(s.rejected, null, 2),
    );
  }
}

// Run directly (npm run load / load:rebuild).
const invokedDirectly = process.argv[1] && import.meta.url.endsWith(path.basename(process.argv[1]));
if (invokedDirectly) {
  const rebuild = process.argv.includes('--rebuild');
  load({ rebuild })
    .then((s) => printSummary(s, rebuild))
    .then(() => closePool())
    .catch(async (e) => {
      console.error(e);
      await closePool();
      process.exit(1);
    });
}
