import { describe, it, expect, afterAll, beforeAll } from 'vitest';
import { writeRecord, setRecordStatus, RecordValidationError } from '../src/write';
import { filter } from '../src/api';
import { query, closePool } from '../src/db';

// System-of-record write path. Skipped when DATABASE_URL is not set. Uses throwaway record ids
// and cleans up after itself; embed:false keeps it free of OpenAI calls.
const hasDb = Boolean(process.env.DATABASE_URL);
const suite = hasDb ? describe : describe.skip;

const VALID_ID = 'rec-test-write-path-zzz-001';
const INVALID_ID = 'rec-test-write-invalid-zzz-001';

const validRecord = {
  record_id: VALID_ID,
  schema_version: '1.5',
  record_type: 'fabricated_sign',
  source: { doc_type: 'shop' },
  classification: { sign_category: 'monument', illuminated: false },
  structure: [{ component: 'test_panel', provenance: 'drawing' }],
  knowledge: { plain_language_summary: 'A throwaway monument used by the write-path test.' },
};

// fabricated_sign requires `structure` (>=1) — omitting it must fail the gate.
const invalidRecord = {
  record_id: INVALID_ID,
  schema_version: '1.5',
  record_type: 'fabricated_sign',
  source: { doc_type: 'shop' },
  classification: { sign_category: 'monument', illuminated: false },
};

async function cleanup(): Promise<void> {
  await query('delete from signs where record_id = any($1::text[])', [[VALID_ID, INVALID_ID]]);
  await query('delete from kb_chunks where source_id = any($1::text[])', [[VALID_ID, INVALID_ID]]);
}

suite('write path (system of record)', () => {
  beforeAll(cleanup);
  afterAll(async () => {
    await cleanup();
    await closePool();
  });

  it('rejects an invalid record at the gate and never writes it (the write gate)', async () => {
    await expect(writeRecord(invalidRecord, { embed: false })).rejects.toBeInstanceOf(RecordValidationError);
    const present = await query<{ n: number }>('select count(*)::int n from signs where record_id = $1', [INVALID_ID]);
    expect(present.rows[0].n).toBe(0);
  });

  it('writes a valid record to staging; live-default query hides it; approval promotes it', async () => {
    const res = await writeRecord(validRecord, { status: 'staging', embed: false });
    expect(res.action).toBe('inserted');
    expect(res.status).toBe('staging');

    // The query API defaults to status='live' — a staged record is invisible to it.
    const liveOnly = await filter({ sign_category: 'monument' }, 1000);
    expect(liveOnly.some((r) => r.record_id === VALID_ID)).toBe(false);

    // The review UI passes status explicitly and sees it.
    const staged = await filter({ sign_category: 'monument', status: 'staging' } as any, 1000);
    expect(staged.some((r) => r.record_id === VALID_ID)).toBe(true);

    // Approve -> live -> visible to the default query.
    const promoted = await setRecordStatus(VALID_ID, 'live');
    expect(promoted).toBe(true);
    const live = await filter({ sign_category: 'monument' }, 1000);
    expect(live.some((r) => r.record_id === VALID_ID)).toBe(true);
  });

  it('re-writing identical content is idempotent (unchanged)', async () => {
    const res = await writeRecord(validRecord, { status: 'live', embed: false });
    expect(res.action).toBe('unchanged');
  });
});
