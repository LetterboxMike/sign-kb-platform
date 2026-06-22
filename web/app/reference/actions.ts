'use server';

import { revalidatePath } from 'next/cache';
import { proposeReferenceEntry, upsertReferenceEntry, type ReferenceLayerEntry, type ReferenceProposal } from '@/lib/kb';

export async function research(name: string, notes?: string): Promise<ReferenceProposal> {
  return proposeReferenceEntry({ name, notes });
}

export async function save(entry: ReferenceLayerEntry): Promise<'inserted' | 'updated'> {
  const result = await upsertReferenceEntry(entry);
  revalidatePath('/reference');
  return result;
}
