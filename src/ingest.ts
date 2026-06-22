import fs from 'node:fs';
import path from 'node:path';
import { query } from './db';
import { extractFromPdf } from './extract';
import { writeRecord } from './write';

/**
 * Ingestion orchestration: a drawing -> candidate records at status='staging', gated by the
 * schema on write, recorded as an ingestion_job. Human-gated by design — nothing reaches 'live'
 * here; the review queue promotes staged candidates on admin approval.
 *
 * Clean (schema-valid) candidates are written to staging. Schema-invalid candidates never touch
 * a table (the write gate); they're held on the job's `flagged` for the reviewer to fix. This is
 * the plain server-side path; an Eve durable workflow can wrap it later (eve_session_id column).
 */

export interface IngestResult {
  jobId: string;
  status: 'review' | 'done' | 'failed';
  candidateRecordIds: string[];
  staged: number;
  flagged: { proposed_record_id: string | null; errors: string[]; flags: string[] }[];
  extractionNotes: string;
  error?: string;
}

async function recordIdExists(id: string): Promise<boolean> {
  const r = await query('select 1 from signs where record_id = $1', [id]);
  return r.rows.length > 0;
}

/** Staging candidates must not collide with existing record_ids; suffix on conflict. */
async function uniqueRecordId(proposed: unknown): Promise<string> {
  let base = typeof proposed === 'string' && proposed.trim() ? proposed.trim() : 'rec-ingested-001';
  if (!(await recordIdExists(base))) return base;
  for (let n = 2; ; n++) {
    const candidate = `${base}-s${n}`;
    if (!(await recordIdExists(candidate))) return candidate;
  }
}

export interface IngestOptions {
  uploadedBy?: string | null;
  sourcePath?: string | null; // storage key / path of the drawing
}

export async function ingestPdf(pdf: Buffer, filename: string, opts: IngestOptions = {}): Promise<IngestResult> {
  const jobRes = await query<{ id: string }>(
    `insert into ingestion_jobs (uploaded_by, source_filename, source_path, status)
     values ($1, $2, $3, 'extracting') returning id`,
    [opts.uploadedBy ?? null, filename, opts.sourcePath ?? null],
  );
  const jobId = jobRes.rows[0].id;

  try {
    const { candidates, extraction_notes } = await extractFromPdf(pdf, filename);
    const candidateRecordIds: string[] = [];
    const flagged: IngestResult['flagged'] = [];

    for (const c of candidates) {
      if (!c.valid) {
        flagged.push({ proposed_record_id: c.record?.record_id ?? null, errors: c.errors, flags: c.flags });
        continue;
      }
      const recordId = await uniqueRecordId(c.record?.record_id);
      const record = { ...c.record, record_id: recordId };
      await writeRecord(record, { status: 'staging', submittedBy: opts.uploadedBy ?? null });
      candidateRecordIds.push(recordId);
    }

    const status: IngestResult['status'] = candidateRecordIds.length || flagged.length ? 'review' : 'done';
    await query(
      `update ingestion_jobs set status=$2, candidate_record_ids=$3, flagged=$4::jsonb,
         extraction_notes=$5, updated_at=now() where id=$1`,
      [jobId, status, candidateRecordIds, JSON.stringify(flagged), extraction_notes],
    );

    return { jobId, status, candidateRecordIds, staged: candidateRecordIds.length, flagged, extractionNotes: extraction_notes };
  } catch (e) {
    const message = e instanceof Error ? e.message : String(e);
    await query('update ingestion_jobs set status=$2, error=$3, updated_at=now() where id=$1', [jobId, 'failed', message]);
    return { jobId, status: 'failed', candidateRecordIds: [], staged: 0, flagged: [], extractionNotes: '', error: message };
  }
}

export async function ingestFile(filePath: string, opts: IngestOptions = {}): Promise<IngestResult> {
  return ingestPdf(fs.readFileSync(filePath), path.basename(filePath), { sourcePath: filePath, ...opts });
}
