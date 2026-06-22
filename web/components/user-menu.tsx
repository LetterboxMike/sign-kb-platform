'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { LogOut } from 'lucide-react';
import { createClient } from '@/lib/supabase/client';
import { Button } from '@/components/ui/button';

export function UserMenu({ email }: { email: string }) {
  const router = useRouter();
  async function signOut() {
    await createClient().auth.signOut();
    router.push('/login');
    router.refresh();
  }
  return (
    <div className="flex items-center gap-1">
      <Link href="/account" className="hidden max-w-[160px] truncate text-xs text-muted-foreground hover:text-foreground md:inline" title={email}>
        {email}
      </Link>
      <Button variant="ghost" size="icon" aria-label="Sign out" onClick={signOut} title="Sign out">
        <LogOut className="h-4 w-4" />
      </Button>
    </div>
  );
}
