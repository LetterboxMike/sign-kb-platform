'use server';

import { revalidatePath } from 'next/cache';
import { setRecordStatus } from '@/lib/kb';
import { requireAdmin } from '@/lib/auth';

/**
 * Review decisions. The staged record was already written through the schema gate, so approval
 * is a status flip to 'live' (no re-embed — content is unchanged). Reject marks it 'rejected'.
 * Admin-only: approving to 'live' is the publish gate; contributors stage but cannot publish.
 * NOTE: inline edit-then-revalidate is a follow-up; today the reviewer approves/rejects as-is or
 * fixes the record in the corpus tooling.
 */
export async function approveRecord(recordId: string): Promise<void> {
  const me = await requireAdmin();
  await setRecordStatus(recordId, 'live', { reviewedBy: me.id });
  revalidatePath('/review');
  revalidatePath(`/review/${recordId}`);
}

export async function rejectRecord(recordId: string): Promise<void> {
  const me = await requireAdmin();
  await setRecordStatus(recordId, 'rejected', { reviewedBy: me.id });
  revalidatePath('/review');
  revalidatePath(`/review/${recordId}`);
}
