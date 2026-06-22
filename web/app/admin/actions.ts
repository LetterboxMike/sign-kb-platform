'use server';

import { revalidatePath } from 'next/cache';
import { query } from '@/lib/kb';
import { requireAdmin, type Role } from '@/lib/auth';

export interface AppUserRow {
  id: string;
  email: string | null;
  role: Role;
  created_at: string;
}

/** All app users and their roles. Admin-only. Rows appear once a user has signed in (the row is
 *  self-provisioned on first authenticated request). */
export async function listAppUsers(): Promise<AppUserRow[]> {
  await requireAdmin();
  const r = await query<AppUserRow>('select id, email, role, created_at from app_users order by created_at');
  return r.rows;
}

const ROLES: Role[] = ['viewer', 'contributor', 'admin'];

/** Change a user's role. Admin-only. Guards against an admin demoting themselves out of admin
 *  (which could otherwise lock the platform out of its last admin). */
export async function setUserRole(id: string, role: Role): Promise<{ ok: boolean; error?: string }> {
  const me = await requireAdmin();
  if (!ROLES.includes(role)) return { ok: false, error: 'invalid role' };
  if (id === me.id && role !== 'admin') {
    return { ok: false, error: 'You cannot remove your own admin role.' };
  }
  const r = await query('update app_users set role = $2 where id = $1', [id, role]);
  if ((r.rowCount ?? 0) === 0) return { ok: false, error: 'user not found' };
  revalidatePath('/admin');
  return { ok: true };
}
