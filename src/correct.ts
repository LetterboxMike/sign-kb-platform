import { query } from './db';
import { requireOpenAIKey } from './config';
import { search } from './api';
import { validateRecord } from './validate';
import { writeRecord } from './write';
import { runEval, passes } from './eval';

/**
 * Governed self-correction. A correction proposes a change set against live records; on approval
 * it is snapshotted, applied (re-validated + re-embedded), then eval-gated — if the retrieval
 * suite regresses it auto-reverts from the snapshot. Every committed correction keeps an audit
 * row and an exact one-click revert. A chat correction NEVER writes the corpus directly: it only
 * produces a proposal a human approves. (platform-architecture.md: propose, verify, approve,
 * commit, audit.)
 */

const MODEL = process.env.CORRECTION_MODEL ?? process.env.CHAT_MODEL ?? 'gpt-5.4';

export interface ChangeEntry {
  record_id: string;
  path: string; // dot-path into the record (e.g. "classification.illumination_method")
  before: unknown;
  after: unknown;
  reason?: string;
}

export type CorrectionStatus = 'proposed' | 'approved' | 'rejected' | 'reverted';

export interface PerRecordPreview {
  record_id: string;
  valid: boolean; // would the corrected record pass the schema gate?
  errors: string[];
  entries: ChangeEntry[];
  staleEntries: string[]; // paths whose current value != the entry's `before`
}

export interface CorrectionProposal {
  correctionId: string;
  prompt: string | null;
  changeSet: ChangeEntry[];
  perRecord: PerRecordPreview[];
  allValid: boolean;
}

export function getPath(obj: any, path: string): unknown {
  return path.split('.').reduce<any>((o, k) => (o == null ? undefined : o[k]), obj);
}

export function setPath(obj: any, path: string, value: unknown): void {
  const keys = path.split('.');
  const last = keys.pop()!;
  let o = obj;
  for (const k of keys) {
    if (o[k] == null || typeof o[k] !== 'object') o[k] = {};
    o = o[k];
  }
  o[last] = value;
}

async function loadRaw(recordIds: string[]): Promise<Map<string, { raw: any; status: string }>> {
  if (recordIds.length === 0) return new Map();
  const r = await query<{ record_id: string; raw: any; status: string }>(
    'select record_id, raw, status from signs where record_id = any($1::text[])',
    [recordIds],
  );
  return new Map(r.rows.map((row) => [row.record_id, { raw: row.raw, status: row.status }]));
}

/** Build the per-record preview: apply the change set to copies and re-validate (schema gate). */
async function previewChangeSet(changeSet: ChangeEntry[]): Promise<PerRecordPreview[]> {
  const byRecord = new Map<string, ChangeEntry[]>();
  for (const e of changeSet) {
    if (!byRecord.has(e.record_id)) byRecord.set(e.record_id, []);
    byRecord.get(e.record_id)!.push(e);
  }
  const current = await loadRaw([...byRecord.keys()]);
  const previews: PerRecordPreview[] = [];
  for (const [recordId, entries] of byRecord) {
    const cur = current.get(recordId);
    if (!cur) {
      previews.push({ record_id: recordId, valid: false, errors: ['record not found or not live'], entries, staleEntries: entries.map((e) => e.path) });
      continue;
    }
    const draft = structuredClone(cur.raw);
    const staleEntries: string[] = [];
    for (const e of entries) {
      if (JSON.stringify(getPath(cur.raw, e.path)) !== JSON.stringify(e.before)) staleEntries.push(e.path);
      setPath(draft, e.path, e.after);
    }
    const { valid, errors } = validateRecord(draft);
    previews.push({ record_id: recordId, valid, errors, entries, staleEntries });
  }
  return previews;
}

async function insertCorrection(prompt: string | null, changeSet: ChangeEntry[]): Promise<string> {
  const r = await query<{ id: string }>(
    `insert into corrections (prompt, change_set, status) values ($1, $2::jsonb, 'proposed') returning id`,
    [prompt, JSON.stringify(changeSet)],
  );
  return r.rows[0].id;
}

/** Propose a correction from an explicit change set (precise edit; no model call). */
export async function proposeExplicit(changeSet: ChangeEntry[], prompt: string | null = null): Promise<CorrectionProposal> {
  const perRecord = await previewChangeSet(changeSet);
  const correctionId = await insertCorrection(prompt, changeSet);
  return { correctionId, prompt, changeSet, perRecord, allValid: perRecord.every((p) => p.valid) };
}

/** Propose a correction from a plain-language prompt: retrieve relevant records, have the model
 *  produce a precise change set limited to those records, then preview + re-validate. */
export async function proposeFromPrompt(
  prompt: string,
  opts: { k?: number; recordIds?: string[] } = {},
): Promise<CorrectionProposal> {
  // When recordIds are given (the per-record AI edit widget), target exactly those records and
  // skip the corpus search; otherwise retrieve the most relevant records for the request.
  let allowed: Set<string>;
  let records: { record_id: string; raw: any }[];
  if (opts.recordIds && opts.recordIds.length) {
    const loaded = await loadRaw(opts.recordIds);
    records = [...loaded.entries()].map(([record_id, v]) => ({ record_id, raw: v.raw }));
    allowed = new Set(records.map((r) => r.record_id));
  } else {
    const hits = await search(prompt, {}, opts.k ?? 8);
    allowed = new Set(hits.map((h) => h.record_id));
    records = hits.map((h) => ({ record_id: h.record_id, raw: h.raw }));
  }
  const system = [
    'You correct knowledge-base sign records. Given a correction request and the candidate records,',
    'produce a PRECISE change set: only the fields that should change, only on the records provided.',
    'Use dot-paths into the record JSON (e.g. "classification.illumination_method", "knowledge.rationale").',
    'For each change give the exact current value as "before" and the corrected value as "after".',
    'Use only record_ids from the provided set. Do not invent fields or values. If nothing should',
    'change, return an empty change_set.',
    '',
    'Respond with ONLY JSON: {"change_set": [{"record_id": "...", "path": "...", "before": <v>, "after": <v>, "reason": "..."}]}',
    '',
    'RECORDS:',
    JSON.stringify(records),
  ].join('\n');

  const res = await fetch('https://api.openai.com/v1/chat/completions', {
    method: 'POST',
    headers: { Authorization: `Bearer ${requireOpenAIKey()}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      model: MODEL,
      messages: [
        { role: 'system', content: system },
        { role: 'user', content: prompt },
      ],
      response_format: { type: 'json_object' },
    }),
  });
  if (!res.ok) throw new Error(`OpenAI correction ${res.status}: ${await res.text()}`);
  const json = (await res.json()) as { choices?: { message?: { content?: string } }[] };
  let parsed: any = {};
  try {
    parsed = JSON.parse(json.choices?.[0]?.message?.content ?? '{}');
  } catch {
    parsed = {};
  }
  const raw: any[] = Array.isArray(parsed.change_set) ? parsed.change_set : [];
  // Keep only well-formed entries targeting retrieved records.
  const changeSet: ChangeEntry[] = raw
    .filter((e) => e && typeof e.record_id === 'string' && allowed.has(e.record_id) && typeof e.path === 'string')
    .map((e) => ({ record_id: e.record_id, path: e.path, before: e.before, after: e.after, reason: e.reason }));

  const perRecord = await previewChangeSet(changeSet);
  const correctionId = await insertCorrection(prompt, changeSet);
  return { correctionId, prompt, changeSet, perRecord, allValid: changeSet.length > 0 && perRecord.every((p) => p.valid) };
}

export interface ApplyResult {
  status: 'approved' | 'rejected';
  evalPassed: boolean;
  evalReasons: string[];
  metrics?: Record<string, number>;
  error?: string;
}

/**
 * Approve + commit a proposed correction. Snapshots affected records, applies the change set
 * (re-validate + re-embed via writeRecord), runs the retrieval eval, and auto-reverts on
 * regression. Returns approved (committed) or rejected (reverted/invalid), with the eval result.
 */
export async function applyCorrection(correctionId: string, opts: { approvedBy?: string | null } = {}): Promise<ApplyResult> {
  const cr = await query<{ change_set: ChangeEntry[]; status: CorrectionStatus }>(
    'select change_set, status from corrections where id = $1',
    [correctionId],
  );
  if (cr.rows.length === 0) throw new Error('correction not found');
  if (cr.rows[0].status !== 'proposed') throw new Error(`correction is '${cr.rows[0].status}', not 'proposed'`);
  const changeSet = cr.rows[0].change_set;

  const byRecord = new Map<string, ChangeEntry[]>();
  for (const e of changeSet) {
    if (!byRecord.has(e.record_id)) byRecord.set(e.record_id, []);
    byRecord.get(e.record_id)!.push(e);
  }
  const ids = [...byRecord.keys()];
  const current = await loadRaw(ids);

  // Snapshot prior state for exact revert, BEFORE any mutation.
  const snapshot: Record<string, { raw: any; status: string }> = {};
  for (const id of ids) {
    const cur = current.get(id);
    if (!cur) {
      await query("update corrections set status='rejected', eval_result=$2::jsonb where id=$1", [
        correctionId,
        JSON.stringify({ error: `record ${id} not found` }),
      ]);
      return { status: 'rejected', evalPassed: false, evalReasons: [`record ${id} not found`], error: 'record not found' };
    }
    snapshot[id] = { raw: cur.raw, status: cur.status };
  }
  await query('update corrections set snapshot=$2::jsonb where id=$1', [correctionId, JSON.stringify(snapshot)]);

  const restore = async () => {
    for (const id of ids) {
      await writeRecord(snapshot[id].raw, { status: snapshot[id].status as any });
    }
  };

  // Apply (each writeRecord re-validates + re-embeds). On any schema failure, roll back + reject.
  try {
    for (const id of ids) {
      const draft = structuredClone(snapshot[id].raw);
      for (const e of byRecord.get(id)!) setPath(draft, e.path, e.after);
      await writeRecord(draft, { status: snapshot[id].status as any });
    }
  } catch (e) {
    await restore();
    const error = e instanceof Error ? e.message : 'apply failed';
    await query("update corrections set status='rejected', eval_result=$2::jsonb where id=$1", [
      correctionId,
      JSON.stringify({ error }),
    ]);
    return { status: 'rejected', evalPassed: false, evalReasons: [error], error };
  }

  // Eval gate against the now-updated index.
  const report = await runEval();
  const verdict = passes(report.metrics);
  if (verdict.ok) {
    await query(
      "update corrections set status='approved', approved_by=$2, committed_at=now(), eval_result=$3::jsonb where id=$1",
      [correctionId, opts.approvedBy ?? null, JSON.stringify({ passed: true, metrics: report.metrics })],
    );
    return { status: 'approved', evalPassed: true, evalReasons: [], metrics: report.metrics };
  }

  // Regression — auto-revert.
  await restore();
  await query("update corrections set status='rejected', eval_result=$2::jsonb where id=$1", [
    correctionId,
    JSON.stringify({ passed: false, reasons: verdict.reasons, metrics: report.metrics }),
  ]);
  return { status: 'rejected', evalPassed: false, evalReasons: verdict.reasons, metrics: report.metrics };
}

/** One-click revert of a committed correction: restore each record's snapshot exactly. */
export async function revertCorrection(correctionId: string): Promise<void> {
  const cr = await query<{ snapshot: Record<string, { raw: any; status: string }> | null; status: CorrectionStatus }>(
    'select snapshot, status from corrections where id = $1',
    [correctionId],
  );
  if (cr.rows.length === 0) throw new Error('correction not found');
  if (cr.rows[0].status !== 'approved') throw new Error(`only an 'approved' correction can be reverted (is '${cr.rows[0].status}')`);
  const snapshot = cr.rows[0].snapshot ?? {};
  for (const [, snap] of Object.entries(snapshot)) {
    await writeRecord(snap.raw, { status: snap.status as any });
  }
  await query("update corrections set status='reverted', reverted_at=now() where id=$1", [correctionId]);
}

/** Direct field edit for a NON-live (staging) record — used by inline editing before approval.
 *  Re-validates the whole record through the schema gate (writeRecord). Live records are refused:
 *  they must go through the governed correction workflow (propose → eval-gate → approve). */
export async function setRecordField(recordId: string, path: string, value: unknown): Promise<void> {
  const r = await query<{ raw: any; status: string }>('select raw, status from signs where record_id = $1', [recordId]);
  if (r.rows.length === 0) throw new Error('record not found');
  if (r.rows[0].status === 'live') {
    throw new Error('live records must be edited through the correction workflow, not direct edit');
  }
  const raw = structuredClone(r.rows[0].raw);
  setPath(raw, path, value);
  await writeRecord(raw, { status: r.rows[0].status as any });
}

export interface CorrectionRow {
  id: string;
  prompt: string | null;
  change_set: ChangeEntry[];
  status: CorrectionStatus;
  eval_result: any;
  created_at: string;
  committed_at: string | null;
}

export async function listCorrections(limit = 50): Promise<CorrectionRow[]> {
  const r = await query<CorrectionRow>(
    'select id, prompt, change_set, status, eval_result, created_at, committed_at from corrections order by created_at desc limit $1',
    [limit],
  );
  return r.rows;
}

export async function getCorrection(id: string): Promise<CorrectionRow | null> {
  const r = await query<CorrectionRow>(
    'select id, prompt, change_set, status, eval_result, created_at, committed_at from corrections where id = $1',
    [id],
  );
  return r.rows[0] ?? null;
}
