// App-level role governance (Phase 2 multi-user). This is the REAL access control for the app:
// every KB read/write goes through `pg` as the DB owner (see lib/kb.ts → @kb/db), so RLS on the
// data-core tables is defense-in-depth, not the gate. The gate is here — server actions, route
// handlers, and page server components call requireRole/requireAdmin/requireContributor before
// they mutate anything. Roles: viewer (read) < contributor (write/propose) < admin (approve/govern).
//
// Server-only by construction: it imports next/headers (cookies) and the pg pool, both of which
// throw if pulled into a client bundle. Client components import only its *types*.
import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { query } from '@/lib/kb';

export type Role = 'viewer' | 'contributor' | 'admin';

const RANK: Record<Role, number> = { viewer: 0, contributor: 1, admin: 2 };

export interface AppUser {
  id: string;
  email: string | null;
  role: Role;
}

export class AuthError extends Error {
  status = 401;
  constructor(message = 'Not signed in') {
    super(message);
    this.name = 'AuthError';
  }
}

export class ForbiddenError extends Error {
  status = 403;
  constructor(public required: Role, public have: Role) {
    super(`Requires ${required} role (you are ${have})`);
    this.name = 'ForbiddenError';
  }
}

/** Pure comparison: does `role` satisfy the `min` requirement? */
export function roleAtLeast(role: Role, min: Role): boolean {
  return RANK[role] >= RANK[min];
}

/** Emails that bootstrap to admin on first login. Configure via ADMIN_EMAILS (comma-separated);
 *  defaults to the project owner so the platform is never left without an admin. */
function bootstrapAdmins(): string[] {
  const fromEnv = (process.env.ADMIN_EMAILS ?? '')
    .split(',')
    .map((s) => s.trim().toLowerCase())
    .filter(Boolean);
  return fromEnv.length ? fromEnv : ['michael@letterboxsigndesign.com'];
}

/**
 * The current app user (session + role), or null if not signed in. Self-provisioning: the first
 * time an authenticated Supabase user is seen, an app_users row is created — role 'admin' if their
 * email is a bootstrap admin, else 'viewer'. Email is backfilled if it was missing.
 */
export async function currentAppUser(): Promise<AppUser | null> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return null;

  const email = user.email ?? null;
  const existing = await query<{ id: string; email: string | null; role: Role }>(
    'select id, email, role from app_users where id = $1',
    [user.id],
  );
  if (existing.rows[0]) {
    const row = existing.rows[0];
    if (!row.email && email) {
      await query('update app_users set email = $2 where id = $1', [user.id, email]);
      return { ...row, email };
    }
    return row;
  }

  const role: Role = email && bootstrapAdmins().includes(email.toLowerCase()) ? 'admin' : 'viewer';
  await query(
    `insert into app_users (id, email, role) values ($1, $2, $3)
     on conflict (id) do update set email = excluded.email`,
    [user.id, email, role],
  );
  return { id: user.id, email, role };
}

/** Require a signed-in user (any role). Throws AuthError otherwise. */
export async function requireUser(): Promise<AppUser> {
  const me = await currentAppUser();
  if (!me) throw new AuthError();
  return me;
}

/** Require at least `min` role. Throws AuthError (not signed in) or ForbiddenError (wrong role). */
export async function requireRole(min: Role): Promise<AppUser> {
  const me = await requireUser();
  if (!roleAtLeast(me.role, min)) throw new ForbiddenError(min, me.role);
  return me;
}

export const requireContributor = (): Promise<AppUser> => requireRole('contributor');
export const requireAdmin = (): Promise<AppUser> => requireRole('admin');

/**
 * Route-handler guard. Returns the user when authorized, or a NextResponse (401/403) to return
 * directly. Use in API routes that can't rely on a thrown error boundary:
 *   const gate = await guardRoute('contributor');
 *   if (gate instanceof NextResponse) return gate;
 */
export async function guardRoute(min: Role): Promise<AppUser | NextResponse> {
  try {
    return await requireRole(min);
  } catch (e) {
    if (e instanceof ForbiddenError) return NextResponse.json({ error: e.message }, { status: 403 });
    if (e instanceof AuthError) return NextResponse.json({ error: e.message }, { status: 401 });
    throw e;
  }
}
