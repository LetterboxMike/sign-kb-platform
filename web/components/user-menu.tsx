'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { LogOut } from 'lucide-react';
import { createClient } from '@/lib/supabase/client';
import type { Role } from '@/lib/auth';
import { Button } from '@/components/ui/button';

export function UserMenu({ email, role }: { email: string; role?: Role }) {
  const router = useRouter();
  async function signOut() {
    await createClient().auth.signOut();
    router.push('/login');
    router.refresh();
  }
  return (
    <div className="flex items-center gap-1">
      <Link href="/account" className="hidden max-w-[200px] items-center gap-1.5 truncate text-xs text-muted-foreground hover:text-foreground md:inline-flex" title={email}>
        {role ? <span className="rounded bg-secondary px-1.5 py-0.5 font-medium capitalize text-secondary-foreground">{role}</span> : null}
        <span className="truncate">{email}</span>
      </Link>
      <Button variant="ghost" size="icon" aria-label="Sign out" onClick={signOut} title="Sign out">
        <LogOut className="h-4 w-4" />
      </Button>
    </div>
  );
}
