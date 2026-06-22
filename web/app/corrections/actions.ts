'use server';

import { revalidatePath } from 'next/cache';
import { proposeFromPrompt, applyCorrection, revertCorrection, type CorrectionProposal, type ApplyResult } from '@/lib/kb';

export async function propose(prompt: string): Promise<CorrectionProposal> {
  return proposeFromPrompt(prompt);
}

export async function approve(correctionId: string): Promise<ApplyResult> {
  const result = await applyCorrection(correctionId);
  revalidatePath('/corrections');
  return result;
}

export async function revert(correctionId: string): Promise<void> {
  await revertCorrection(correctionId);
  revalidatePath('/corrections');
}
