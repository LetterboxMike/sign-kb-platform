import Link from 'next/link';
import { Lock } from 'lucide-react';
import type { Role } from '@/lib/auth';
import { Button } from '@/components/ui/button';

/** Rendered in place of a page's content when the signed-in user's role is insufficient. */
export function NotAuthorized({ required, have }: { required: Role; have: Role }) {
  return (
    <div className="mx-auto flex max-w-md flex-col items-center gap-3 rounded-lg border border-dashed p-10 text-center">
      <Lock className="h-6 w-6 text-muted-foreground" />
      <h1 className="text-lg font-semibold tracking-tight">Not authorized</h1>
      <p className="text-sm text-muted-foreground">
        This area needs the <span className="font-medium">{required}</span> role. Your account is{' '}
        <span className="font-medium">{have}</span>. Ask an admin to update your role.
      </p>
      <Button asChild variant="outline" size="sm">
        <Link href="/search">Back to search</Link>
      </Button>
    </div>
  );
}
