'use server';

import { revalidatePath } from 'next/cache';
import {
  proposeExplicit,
  proposeFromPrompt,
  applyCorrection,
  setRecordField,
  type CorrectionProposal,
  type ApplyResult,
} from '@/lib/kb';
import { requireAdmin, requireContributor } from '@/lib/auth';

/** Propose a single-field edit on a LIVE record. Routes through the governed correction workflow:
 *  returns a proposal (diff + schema-validity preview) the user approves explicitly. */
export async function proposeFieldEdit(
  recordId: string,
  path: string,
  before: unknown,
  after: unknown,
  reason?: string,
): Promise<CorrectionProposal> {
  await requireContributor();
  return proposeExplicit([{ record_id: recordId, path, before, after, reason }], `inline edit: ${path}`);
}

/** Natural-language edit on a single record (the AI edit widget): scope the model-assisted change
 *  set to just this record (no corpus search), then preview + re-validate. */
export async function proposeRecordEdit(recordId: string, prompt: string): Promise<CorrectionProposal> {
  await requireContributor();
  return proposeFromPrompt(prompt, { recordIds: [recordId] });
}

/** Approve + commit a proposed inline/AI edit (re-validate, re-embed, eval-gate, audit + revert). */
export async function approveFieldEdit(correctionId: string, recordId: string): Promise<ApplyResult> {
  const me = await requireAdmin();
  const result = await applyCorrection(correctionId, { approvedBy: me.id });
  revalidatePath(`/record/${encodeURIComponent(recordId)}`);
  return result;
}

/** Direct edit for a STAGING record (not yet live). Re-validated by the schema gate; live records
 *  are refused server-side and must use proposeFieldEdit. */
export async function directEdit(recordId: string, path: string, value: unknown): Promise<{ ok: boolean; error?: string }> {
  try {
    await requireContributor();
    await setRecordField(recordId, path, value);
    revalidatePath(`/record/${encodeURIComponent(recordId)}`);
    return { ok: true };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : 'edit failed' };
  }
}
