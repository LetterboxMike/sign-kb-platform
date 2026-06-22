'use server';

import { revalidatePath } from 'next/cache';
import { saveQuery, deleteSavedQuery } from '@/lib/kb';
import { requireContributor } from '@/lib/auth';

export async function saveSearch(name: string, q: string, category: string): Promise<void> {
  await requireContributor();
  await saveQuery({ name: name.trim() || q, kind: 'search', q, filters: category ? { category } : {} });
  revalidatePath('/search');
}

export async function removeSaved(id: string): Promise<void> {
  await requireContributor();
  await deleteSavedQuery(id);
  revalidatePath('/search');
}
