'use client';

import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { Check, Loader2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { resolve } from '@/app/vocab/actions';

/** Resolve a single proposed_new_term to a real enum value. A dropdown of valid schema values
 *  (when known) replaces blind free-text typing; falls back to a text input if no enum is found. */
export function VocabResolve({ recordId, path, options }: { recordId: string; path: string; options: string[] }) {
  const [value, setValue] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState(false);
  const [pending, start] = useTransition();
  const router = useRouter();

  function submit() {
    if (!value.trim() || pending) return;
    setError(null);
    start(async () => {
      const r = await resolve(recordId, path, value);
      if (r.ok) {
        setDone(true);
        router.refresh();
      } else {
        setError(r.error ?? 'failed');
      }
    });
  }

  if (done) {
    return (
      <span className="inline-flex items-center gap-1 text-sm text-emerald-600 dark:text-emerald-400">
        <Check className="h-4 w-4" /> Resolved
      </span>
    );
  }

  return (
    <div className="flex flex-col gap-1">
      <div className="flex flex-wrap items-center gap-2">
        {options.length ? (
          <select
            value={value}
            onChange={(e) => setValue(e.target.value)}
            className="h-8 rounded-md border border-input bg-background px-2 text-sm text-foreground"
          >
            <option value="">Choose enum value…</option>
            {options.map((o) => (
              <option key={o} value={o}>
                {o.replaceAll('_', ' ')}
              </option>
            ))}
          </select>
        ) : (
          <Input
            value={value}
            onChange={(e) => setValue(e.target.value)}
            placeholder="resolved enum value"
            className="h-8 max-w-[260px]"
            onKeyDown={(e) => e.key === 'Enter' && submit()}
          />
        )}
        <Button size="sm" onClick={submit} disabled={pending || !value.trim()}>
          {pending ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Check className="h-3.5 w-3.5" />} Resolve
        </Button>
      </div>
      {error ? <span className="text-xs text-destructive">{error}</span> : null}
    </div>
  );
}
