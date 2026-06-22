'use client';

import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { Check } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { resolve } from '@/app/vocab/actions';

export function VocabResolve({ recordId, path }: { recordId: string; path: string }) {
  const [value, setValue] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();
  const router = useRouter();

  function submit() {
    if (!value.trim() || pending) return;
    setError(null);
    start(async () => {
      const r = await resolve(recordId, path, value);
      if (r.ok) router.refresh();
      else setError(r.error ?? 'failed');
    });
  }

  return (
    <div className="flex flex-col gap-1">
      <div className="flex gap-2">
        <Input
          value={value}
          onChange={(e) => setValue(e.target.value)}
          placeholder="resolved enum value"
          className="h-8 max-w-[260px]"
          onKeyDown={(e) => e.key === 'Enter' && submit()}
        />
        <Button size="sm" onClick={submit} disabled={pending || !value.trim()}>
          <Check className="h-3.5 w-3.5" /> Resolve
        </Button>
      </div>
      {error ? <span className="text-xs text-destructive">{error}</span> : null}
    </div>
  );
}
