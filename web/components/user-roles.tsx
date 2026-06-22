'use client';

import { useState, useTransition } from 'react';
import { ShieldCheck } from 'lucide-react';
import { cn } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import { setUserRole, type AppUserRow } from '@/app/admin/actions';
import type { Role } from '@/lib/auth';

const ROLES: Role[] = ['viewer', 'contributor', 'admin'];
const HINT: Record<Role, string> = {
  viewer: 'read only',
  contributor: 'can upload, propose, grade',
  admin: 'can approve, govern, export',
};

export function UserRoles({ users, currentUserId }: { users: AppUserRow[]; currentUserId: string }) {
  const [rows, setRows] = useState(users);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  const [busyId, setBusyId] = useState<string | null>(null);

  function change(id: string, role: Role) {
    setError(null);
    setBusyId(id);
    startTransition(async () => {
      const res = await setUserRole(id, role);
      if (res.ok) setRows((rs) => rs.map((r) => (r.id === id ? { ...r, role } : r)));
      else setError(res.error ?? 'Failed to update role.');
      setBusyId(null);
    });
  }

  if (rows.length === 0) {
    return <p className="text-sm text-muted-foreground">No users yet. A row appears here the first time someone signs in.</p>;
  }

  return (
    <div className="space-y-3">
      <ul className="divide-y rounded-md border">
        {rows.map((u) => (
          <li key={u.id} className="flex flex-wrap items-center justify-between gap-3 p-3">
            <div className="min-w-0">
              <div className="flex items-center gap-2 text-sm font-medium">
                <span className="truncate">{u.email ?? u.id}</span>
                {u.id === currentUserId ? <span className="text-xs font-normal text-muted-foreground">(you)</span> : null}
              </div>
              <div className="text-xs text-muted-foreground">{HINT[u.role]}</div>
            </div>
            <div className="inline-flex overflow-hidden rounded-md border">
              {ROLES.map((r) => {
                const active = u.role === r;
                const lockSelf = u.id === currentUserId && r !== 'admin';
                return (
                  <Button
                    key={r}
                    type="button"
                    variant={active ? 'default' : 'ghost'}
                    size="sm"
                    className={cn('rounded-none capitalize', active && 'pointer-events-none')}
                    disabled={pending || (busyId === u.id) || lockSelf}
                    title={lockSelf ? 'You cannot remove your own admin role' : HINT[r]}
                    onClick={() => !active && change(u.id, r)}
                  >
                    {active ? <ShieldCheck className="mr-1 h-3.5 w-3.5" /> : null}
                    {r}
                  </Button>
                );
              })}
            </div>
          </li>
        ))}
      </ul>
      {error ? <p className="text-sm text-destructive">{error}</p> : null}
    </div>
  );
}
