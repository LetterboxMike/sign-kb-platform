'use server';

import { revalidatePath } from 'next/cache';
import { proposeReferenceEntry, upsertReferenceEntry, type ReferenceLayerEntry, type ReferenceProposal } from '@/lib/kb';
import { requireAdmin, requireContributor } from '@/lib/auth';

export async function research(name: string, notes?: string): Promise<ReferenceProposal> {
  await requireContributor();
  return proposeReferenceEntry({ name, notes });
}

export async function save(entry: ReferenceLayerEntry): Promise<'inserted' | 'updated'> {
  await requireAdmin();
  const result = await upsertReferenceEntry(entry);
  revalidatePath('/reference');
  return result;
}
