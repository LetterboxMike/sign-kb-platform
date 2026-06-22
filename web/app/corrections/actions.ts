'use server';

import { revalidatePath } from 'next/cache';
import { proposeFromPrompt, applyCorrection, revertCorrection, type CorrectionProposal, type ApplyResult } from '@/lib/kb';
import { requireAdmin, requireContributor } from '@/lib/auth';

export async function propose(prompt: string): Promise<CorrectionProposal> {
  await requireContributor();
  return proposeFromPrompt(prompt);
}

export async function approve(correctionId: string): Promise<ApplyResult> {
  const me = await requireAdmin();
  const result = await applyCorrection(correctionId, { approvedBy: me.id });
  revalidatePath('/corrections');
  return result;
}

export async function revert(correctionId: string): Promise<void> {
  await requireAdmin();
  await revertCorrection(correctionId);
  revalidatePath('/corrections');
}
