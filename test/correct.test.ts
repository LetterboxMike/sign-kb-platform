import { describe, it, expect, afterAll, beforeAll } from 'vitest';
import { proposeExplicit, applyCorrection, revertCorrection, getPath } from '../src/correct';
import { RECORD_CASES } from '../src/eval';
import { writeRecord } from '../src/write';
import { query, closePool } from '../src/db';

// Governed self-correction, end-to-end against a live record. Needs DB + OpenAI (apply re-embeds
// and runs the retrieval eval). Self-cleaning: reverts the record and deletes test correction rows.
const hasDeps = Boolean(process.env.DATABASE_URL && process.env.OPENAI_API_KEY);
const suite = hasDeps ? describe : describe.skip;

const PATH = 'knowledge.tradeoffs';
const MARKER = 'TEST self-correction marker — should be reverted.';

suite('governed self-correction', () => {
  let recordId: string;
  let originalRaw: any;
  const correctionIds: string[] = [];

  beforeAll(async () => {
    // A live record NOT in the retrieval eval set, so a benign edit can't perturb the eval gate.
    const excluded = RECORD_CASES.map((c) => c.expected);
    const r = await query<{ record_id: string; raw: any }>(
      `select record_id, raw from signs where status='live' and record_id <> all($1::text[])
       and record_type='fabricated_sign' order by record_id limit 1`,
      [excluded],
    );
    recordId = r.rows[0].record_id;
    originalRaw = r.rows[0].raw;
  }, 60_000);

  afterAll(async () => {
    // Force-restore the record and remove test corrections, regardless of test outcome.
    if (recordId && originalRaw) await writeRecord(originalRaw, { status: 'live' });
    if (correctionIds.length) await query('delete from corrections where id = any($1::uuid[])', [correctionIds]);
    await closePool();
  });

  it('proposes a schema-valid change set without mutating the corpus', async () => {
    const before = getPath(originalRaw, PATH) ?? null;
    const proposal = await proposeExplicit(
      [{ record_id: recordId, path: PATH, before, after: MARKER }],
      'test: set a tradeoffs note',
    );
    correctionIds.push(proposal.correctionId);
    expect(proposal.allValid).toBe(true);
    expect(proposal.perRecord[0].valid).toBe(true);

    // Propose must not have touched the live record.
    const live = await query<{ raw: any }>('select raw from signs where record_id=$1', [recordId]);
    expect(getPath(live.rows[0].raw, PATH) ?? null).toEqual(before);
  });

  it('approves + commits when the eval passes, then reverts to the exact prior state', async () => {
    const before = getPath(originalRaw, PATH) ?? null;
    const proposal = await proposeExplicit([{ record_id: recordId, path: PATH, before, after: MARKER }]);
    correctionIds.push(proposal.correctionId);

    const applied = await applyCorrection(proposal.correctionId, { approvedBy: null });
    expect(applied.status).toBe('approved');
    expect(applied.evalPassed).toBe(true);

    // The change is now live.
    const after = await query<{ raw: any }>('select raw from signs where record_id=$1', [recordId]);
    expect(getPath(after.rows[0].raw, PATH)).toBe(MARKER);

    // The correction row records the audit + snapshot.
    const cr = await query<{ status: string; committed_at: string | null; snapshot: any }>(
      'select status, committed_at, snapshot from corrections where id=$1',
      [proposal.correctionId],
    );
    expect(cr.rows[0].status).toBe('approved');
    expect(cr.rows[0].committed_at).toBeTruthy();
    expect(cr.rows[0].snapshot[recordId]).toBeTruthy();

    // One-click revert restores the prior value exactly.
    await revertCorrection(proposal.correctionId);
    const restored = await query<{ raw: any }>('select raw from signs where record_id=$1', [recordId]);
    expect(getPath(restored.rows[0].raw, PATH) ?? null).toEqual(before);
    const cr2 = await query<{ status: string }>('select status from corrections where id=$1', [proposal.correctionId]);
    expect(cr2.rows[0].status).toBe('reverted');
  }, 180_000);
});
