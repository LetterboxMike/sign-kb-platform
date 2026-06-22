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
 * Durable bulk: uploads `enqueueJob` rows (status='queued') that persist across a restart; a
 * resumable worker `claimNextJob` (atomic, SKIP LOCKED, reclaims stale 'extracting') processes
 * them one at a time and `completeJob`/`failJob`. If the process dies mid-batch the queued jobs
 * survive and the next `process` run drains them. (A Postgres queue stands in for Eve's durable
 * workflow — same guarantee, no framework dependency.)
 */

export interface StageResult {
  candidateRecordIds: string[];
  flagged: { proposed_record_id: string | null; errors: string[]; flags: string[] }[];
  extractionNotes: string;
}

export interface IngestResult extends StageResult {
  jobId: string;
  status: 'review' | 'done' | 'failed';
  staged: number;
  error?: string;
}

export interface IngestOptions {
  uploadedBy?: string | null;
  sourcePath?: string | null; // storage key / path of the drawing
}

async function recordIdExists(id: string): Promise<boolean> {
  const r = await query('select 1 from signs where record_id = $1', [id]);
  return r.rows.length > 0;
}

/** Staging candidates must not collide with existing record_ids; suffix on conflict. */
async function uniqueRecordId(proposed: unknown): Promise<string> {
  const base = typeof proposed === 'string' && proposed.trim() ? proposed.trim() : 'rec-ingested-001';
  if (!(await recordIdExists(base))) return base;
  for (let n = 2; ; n++) {
    const candidate = `${base}-s${n}`;
    if (!(await recordIdExists(candidate))) return candidate;
  }
}

/** Extract a drawing and write its schema-valid candidates to staging. No job lifecycle —
 *  shared by the process-now path (ingestPdf) and the durable worker (processClaimedJob). */
export async function stageFromBuffer(pdf: Buffer, filename: string, opts: IngestOptions = {}): Promise<StageResult> {
  const { candidates, extraction_notes } = await extractFromPdf(pdf, filename);
  const candidateRecordIds: string[] = [];
  const flagged: StageResult['flagged'] = [];
  for (const c of candidates) {
    if (!c.valid) {
      flagged.push({ proposed_record_id: c.record?.record_id ?? null, errors: c.errors, flags: c.flags });
      continue;
    }
    const recordId = await uniqueRecordId(c.record?.record_id);
    await writeRecord({ ...c.record, record_id: recordId }, { status: 'staging', submittedBy: opts.uploadedBy ?? null });
    candidateRecordIds.push(recordId);
  }
  return { candidateRecordIds, flagged, extractionNotes: extraction_notes };
}

function resultStatus(r: StageResult): 'review' | 'done' {
  return r.candidateRecordIds.length || r.flagged.length ? 'review' : 'done';
}

// ---- Durable queue ----

export interface ClaimedJob {
  id: string;
  source_filename: string | null;
  source_path: string | null;
  uploaded_by: string | null;
}

/** Record an upload as a queued job. The durable unit: once queued, it survives a restart. */
export async function enqueueJob(opts: { filename: string; sourcePath: string; uploadedBy?: string | null }): Promise<string> {
  const r = await query<{ id: string }>(
    `insert into ingestion_jobs (uploaded_by, source_filename, source_path, status)
     values ($1, $2, $3, 'queued') returning id`,
    [opts.uploadedBy ?? null, opts.filename, opts.sourcePath],
  );
  return r.rows[0].id;
}

const MAX_ATTEMPTS = 3;

/** Atomically claim the next workable job: a 'queued' one, an 'extracting' one whose worker died
 *  (older than staleMs), or a 'failed' one still under the retry cap (auto-recover from transient
 *  failures). Increments attempts on claim. SKIP LOCKED makes concurrent workers safe. */
export async function claimNextJob(staleMs = 5 * 60_000, maxAttempts = MAX_ATTEMPTS): Promise<ClaimedJob | null> {
  const r = await query<ClaimedJob>(
    `update ingestion_jobs set status='extracting', attempts = attempts + 1, updated_at=now()
     where id = (
       select id from ingestion_jobs
       where status='queued'
          or (status='extracting' and updated_at < now() - ($1::bigint * interval '1 millisecond'))
          or (status='failed' and attempts < $2)
       order by created_at
       for update skip locked
       limit 1
     )
     returning id, source_filename, source_path, uploaded_by`,
    [staleMs, maxAttempts],
  );
  return r.rows[0] ?? null;
}

export async function completeJob(jobId: string, r: StageResult): Promise<'review' | 'done'> {
  const status = resultStatus(r);
  await query(
    `update ingestion_jobs set status=$2, candidate_record_ids=$3, flagged=$4::jsonb,
       extraction_notes=$5, error=null, updated_at=now() where id=$1`,
    [jobId, status, r.candidateRecordIds, JSON.stringify(r.flagged), r.extractionNotes],
  );
  return status;
}

export async function failJob(jobId: string, error: string): Promise<void> {
  await query('update ingestion_jobs set status=$2, error=$3, updated_at=now() where id=$1', [jobId, 'failed', error]);
}

export async function pendingJobCount(staleMs = 5 * 60_000, maxAttempts = MAX_ATTEMPTS): Promise<number> {
  const r = await query<{ n: number }>(
    `select count(*)::int n from ingestion_jobs
     where status='queued'
        or (status='extracting' and updated_at < now() - ($1::bigint * interval '1 millisecond'))
        or (status='failed' and attempts < $2)`,
    [staleMs, maxAttempts],
  );
  return r.rows[0].n;
}

// ---- Process-now (CLI / single-file) ----

export async function ingestPdf(pdf: Buffer, filename: string, opts: IngestOptions = {}): Promise<IngestResult> {
  const jobRes = await query<{ id: string }>(
    `insert into ingestion_jobs (uploaded_by, source_filename, source_path, status)
     values ($1, $2, $3, 'extracting') returning id`,
    [opts.uploadedBy ?? null, filename, opts.sourcePath ?? null],
  );
  const jobId = jobRes.rows[0].id;
  try {
    const staged = await stageFromBuffer(pdf, filename, opts);
    const status = await completeJob(jobId, staged);
    return { jobId, status, ...staged, staged: staged.candidateRecordIds.length };
  } catch (e) {
    const message = e instanceof Error ? e.message : String(e);
    await failJob(jobId, message);
    return { jobId, status: 'failed', candidateRecordIds: [], flagged: [], extractionNotes: '', staged: 0, error: message };
  }
}

export async function ingestFile(filePath: string, opts: IngestOptions = {}): Promise<IngestResult> {
  return ingestPdf(fs.readFileSync(filePath), path.basename(filePath), { sourcePath: filePath, ...opts });
}
