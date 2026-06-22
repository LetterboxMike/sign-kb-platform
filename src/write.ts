import crypto from 'node:crypto';
import type { PoolClient } from 'pg';
import { config } from './config';
import { getPool, withTransaction } from './db';
import { validateRecord } from './validate';
import { mapSignRow, mapComponents, mapMaterials } from './map';
import { mapRecordChunks } from './chunk';
import { embedTexts, toVectorLiteral } from './embed';

/**
 * The system-of-record write path. Under the platform decision the database is the source of
 * truth and JSON is the portability layer (see CLAUDE.md): records are written and validated
 * *in-DB*, not imported from files. This is the single-record primitive the in-app ingestion
 * approval (Phase 2) and governed corrections (Phase 3) call. It shares every projection rule
 * with the bulk loader through map.ts / chunk.ts, so the two write paths can never drift.
 *
 * The schema gate runs here: an invalid record throws and never touches a table — so it can
 * never reach status='live' (build-plan eval #4, the write gate).
 */

export type RecordStatus = 'live' | 'staging' | 'rejected';

/** Thrown when a record fails the schema gate. The caller decides how to surface it; the
 *  record is never written. */
export class RecordValidationError extends Error {
  readonly errors: string[];
  readonly recordId?: string;
  constructor(recordId: string | undefined, errors: string[]) {
    super(`record ${recordId ?? '(no id)'} failed the schema gate: ${errors.slice(0, 5).join('; ')}`);
    this.name = 'RecordValidationError';
    this.errors = errors;
    this.recordId = recordId;
  }
}

export interface WriteOptions {
  status?: RecordStatus; // default 'live'
  submittedBy?: string | null; // contributor uuid (Phase 2)
  reviewedBy?: string | null; // approving admin uuid (Phase 2)
  embed?: boolean; // default true; false skips chunk/embed (structured-only write)
  client?: PoolClient; // run inside an existing transaction if provided
}

export interface WriteResult {
  recordId: string;
  status: RecordStatus;
  action: 'inserted' | 'updated' | 'unchanged';
  chunksEmbedded: number;
  chunksDeleted: number;
  nulledMaterialRefs: number;
}

const SIGNS_COLUMNS = [
  'record_id', 'record_type', 'sign_category', 'sub_type', 'fabrication_family',
  'illumination_method', 'illuminated', 'mounting', 'sides', 'digital_integration',
  'doc_type', 'industry_vertical', 'design_status', 'option_set_id', 'quality_grade',
  'width_in', 'height_in', 'area_sqft', 'ada_tactile', 'ada_braille', 'title_24',
  'is_program', 'raw', 'content_hash', 'schema_version', 'status', 'submitted_by', 'reviewed_by',
] as const;

function hashChunk(chunkType: string, text: string): string {
  return crypto.createHash('sha256').update(`${config.embeddingModel}\n${chunkType}\n${text}`).digest('hex');
}

/** Resolve which of a record's material manufacturer refs actually exist in `reference`;
 *  the rest are nulled (kept in `raw`), mirroring the loader's FK-safety behavior. */
async function nullMissingMaterialRefs(
  c: PoolClient,
  mats: ReturnType<typeof mapMaterials>,
): Promise<{ rows: ReturnType<typeof mapMaterials>; nulled: number }> {
  const refs = [...new Set(mats.map((m) => m.manufacturer_normalized_id).filter(Boolean))] as string[];
  if (refs.length === 0) return { rows: mats, nulled: 0 };
  const present = await c.query<{ normalized_id: string }>(
    'select normalized_id from reference where normalized_id = any($1::text[])',
    [refs],
  );
  const ok = new Set(present.rows.map((r) => r.normalized_id));
  let nulled = 0;
  const rows = mats.map((m) => {
    if (m.manufacturer_normalized_id && !ok.has(m.manufacturer_normalized_id)) {
      nulled++;
      return { ...m, manufacturer_normalized_id: null };
    }
    return m;
  });
  return { rows, nulled };
}

async function writeOne(c: PoolClient, record: any, opts: WriteOptions): Promise<WriteResult> {
  const status: RecordStatus = opts.status ?? 'live';
  const embed = opts.embed ?? true;
  const row = mapSignRow(record);
  const recordId = row.record_id;

  // Current state of this record, if any.
  const cur = await c.query<{ content_hash: string; status: RecordStatus }>(
    'select content_hash, status from signs where record_id = $1',
    [recordId],
  );
  const existing = cur.rows[0];
  const contentUnchanged = existing?.content_hash === row.content_hash;
  const statusUnchanged = existing?.status === status;

  if (existing && contentUnchanged && statusUnchanged) {
    return { recordId, status, action: 'unchanged', chunksEmbedded: 0, chunksDeleted: 0, nulledMaterialRefs: 0 };
  }

  const action: WriteResult['action'] = existing ? 'updated' : 'inserted';

  // Upsert the signs row. status / submitted_by / reviewed_by are written explicitly here;
  // the loader leaves them at their column defaults, so imports never clobber app-set values.
  const values: unknown[] = SIGNS_COLUMNS.map((col) => {
    if (col === 'raw') return JSON.stringify(row.raw);
    if (col === 'status') return status;
    if (col === 'submitted_by') return opts.submittedBy ?? null;
    if (col === 'reviewed_by') return opts.reviewedBy ?? null;
    return (row as any)[col] ?? null;
  });
  const placeholders = SIGNS_COLUMNS.map((col, i) => (col === 'raw' ? `$${i + 1}::jsonb` : `$${i + 1}`));
  const updateSet = SIGNS_COLUMNS.filter((c2) => c2 !== 'record_id')
    .map((c2) => `${c2} = excluded.${c2}`)
    .join(', ');
  await c.query(
    `insert into signs (${SIGNS_COLUMNS.join(',')}) values (${placeholders.join(',')})
     on conflict (record_id) do update set ${updateSet}`,
    values,
  );

  let nulledMaterialRefs = 0;
  // Only rewrite children + chunks when the record content actually changed (a status-only
  // flip leaves them intact).
  if (!contentUnchanged) {
    await c.query('delete from sign_components where record_id = $1', [recordId]);
    await c.query('delete from sign_materials where record_id = $1', [recordId]);

    const comps = mapComponents(record);
    for (const comp of comps) {
      await c.query(
        `insert into sign_components (record_id, component, fabrication_method, illumination, material_refs, mounted_to)
         values ($1,$2,$3,$4,$5,$6)`,
        [comp.record_id, comp.component, comp.fabrication_method, comp.illumination, comp.material_refs, comp.mounted_to],
      );
    }

    const { rows: mats, nulled } = await nullMissingMaterialRefs(c, mapMaterials(record));
    nulledMaterialRefs = nulled;
    for (const m of mats) {
      await c.query(
        `insert into sign_materials (record_id, material_ref, category, product, application, manufacturer_normalized_id)
         values ($1,$2,$3,$4,$5,$6)`,
        [m.record_id, m.material_ref, m.category, m.product, m.application, m.manufacturer_normalized_id],
      );
    }
  }

  // Chunk + embed this record's text (incremental by per-chunk content_hash).
  let chunksEmbedded = 0;
  let chunksDeleted = 0;
  if (embed && !contentUnchanged) {
    const desired = mapRecordChunks(record).map((ch) => ({ ...ch, content_hash: hashChunk(ch.chunk_type, ch.text) }));
    const existingChunks = await c.query<{ chunk_type: string; seq: number; content_hash: string }>(
      "select chunk_type, seq, content_hash from kb_chunks where source_id = $1 and source_kind = 'record'",
      [recordId],
    );
    const have = new Map(existingChunks.rows.map((r) => [`${r.chunk_type} ${r.seq}`, r.content_hash]));
    const desiredKeys = new Set(desired.map((d) => `${d.chunk_type} ${d.seq}`));
    const toEmbed = desired.filter((d) => have.get(`${d.chunk_type} ${d.seq}`) !== d.content_hash);

    if (toEmbed.length > 0) {
      const vectors = await embedTexts(toEmbed.map((d) => d.text));
      for (let i = 0; i < toEmbed.length; i++) {
        const d = toEmbed[i];
        await c.query(
          `insert into kb_chunks (source_id, source_kind, chunk_type, seq, text, content_hash, embedding, embedding_model)
           values ($1,'record',$2,$3,$4,$5,$6::halfvec(${config.embeddingDim}),$7)
           on conflict (source_id, chunk_type, seq) do update set
             source_kind = excluded.source_kind, text = excluded.text, content_hash = excluded.content_hash,
             embedding = excluded.embedding, embedding_model = excluded.embedding_model`,
          [recordId, d.chunk_type, d.seq, d.text, d.content_hash, toVectorLiteral(vectors[i]), config.embeddingModel],
        );
      }
      chunksEmbedded = toEmbed.length;
    }
    // Drop this record's chunks that are no longer produced (e.g. a field was emptied).
    for (const r of existingChunks.rows) {
      if (!desiredKeys.has(`${r.chunk_type} ${r.seq}`)) {
        await c.query('delete from kb_chunks where source_id=$1 and chunk_type=$2 and seq=$3', [recordId, r.chunk_type, r.seq]);
        chunksDeleted++;
      }
    }
  }

  return { recordId, status, action, chunksEmbedded, chunksDeleted, nulledMaterialRefs };
}

/**
 * Write a single record to the KB through the schema gate. Throws RecordValidationError
 * (without touching any table) if the record is invalid. Runs in its own transaction unless
 * an existing `client` is supplied.
 */
export async function writeRecord(record: any, opts: WriteOptions = {}): Promise<WriteResult> {
  const { valid, errors } = validateRecord(record);
  if (!valid) throw new RecordValidationError(record?.record_id, errors);

  if (opts.client) return writeOne(opts.client, record, opts);
  return withTransaction((c) => writeOne(c, record, opts));
}

/**
 * Set a record's lifecycle status (e.g. staging -> live on approval, or live -> rejected).
 * Leaves content and chunks untouched. Returns false if the record does not exist.
 */
export async function setRecordStatus(
  recordId: string,
  status: RecordStatus,
  opts: { reviewedBy?: string | null; client?: PoolClient } = {},
): Promise<boolean> {
  const run = async (c: PoolClient): Promise<boolean> => {
    const res = await c.query(
      'update signs set status = $2, reviewed_by = coalesce($3, reviewed_by) where record_id = $1',
      [recordId, status, opts.reviewedBy ?? null],
    );
    return (res.rowCount ?? 0) > 0;
  };
  if (opts.client) return run(opts.client);
  return withTransaction(run);
}
