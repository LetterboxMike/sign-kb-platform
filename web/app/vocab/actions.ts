'use server';

import { revalidatePath } from 'next/cache';
import { resolveProposedTerm } from '@/lib/kb';
import { requireAdmin } from '@/lib/auth';

export async function resolve(recordId: string, path: string, value: string): Promise<{ ok: boolean; error?: string }> {
  try {
    await requireAdmin();
    await resolveProposedTerm(recordId, path, value.trim());
    revalidatePath('/vocab');
    return { ok: true };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : 'failed' };
  }
}
