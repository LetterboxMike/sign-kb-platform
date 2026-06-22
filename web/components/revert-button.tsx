'use client';

import { useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { Undo2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { revert } from '@/app/corrections/actions';

export function RevertButton({ id }: { id: string }) {
  const [pending, start] = useTransition();
  const router = useRouter();
  return (
    <Button
      size="sm"
      variant="outline"
      disabled={pending}
      onClick={() => start(async () => { await revert(id); router.refresh(); })}
    >
      <Undo2 className="h-3.5 w-3.5" /> {pending ? 'reverting…' : 'Revert'}
    </Button>
  );
}
