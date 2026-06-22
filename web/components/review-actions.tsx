'use client';

import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { Check, X } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { approveRecord, rejectRecord } from '@/app/review/actions';

export function ReviewActions({ recordId }: { recordId: string }) {
  const [pending, start] = useTransition();
  const [done, setDone] = useState<'live' | 'rejected' | null>(null);
  const router = useRouter();

  function act(kind: 'live' | 'rejected') {
    start(async () => {
      if (kind === 'live') await approveRecord(recordId);
      else await rejectRecord(recordId);
      setDone(kind);
      router.refresh();
    });
  }

  if (done) {
    return (
      <span className="text-sm font-medium">
        {done === 'live' ? '✓ Approved to live' : '✗ Rejected'}
      </span>
    );
  }

  return (
    <div className="flex gap-2">
      <Button onClick={() => act('live')} disabled={pending}>
        <Check className="h-4 w-4" /> Approve to live
      </Button>
      <Button variant="destructive" onClick={() => act('rejected')} disabled={pending}>
        <X className="h-4 w-4" /> Reject
      </Button>
    </div>
  );
}
