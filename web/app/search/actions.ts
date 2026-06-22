'use server';

import { revalidatePath } from 'next/cache';
import { saveQuery, deleteSavedQuery } from '@/lib/kb';

export async function saveSearch(name: string, q: string, category: string): Promise<void> {
  await saveQuery({ name: name.trim() || q, kind: 'search', q, filters: category ? { category } : {} });
  revalidatePath('/search');
}

export async function removeSaved(id: string): Promise<void> {
  await deleteSavedQuery(id);
  revalidatePath('/search');
}
