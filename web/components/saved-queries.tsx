'use client';

import { useState, useTransition } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { Bookmark, X } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { saveSearch, removeSaved } from '@/app/search/actions';
import type { SavedQuery } from '@/lib/kb';

function hrefFor(s: SavedQuery): string {
  const params = new URLSearchParams();
  if (s.q) params.set('q', s.q);
  const cat = (s.filters as { category?: string })?.category;
  if (cat) params.set('category', cat);
  return `/search?${params.toString()}`;
}

export function SavedQueries({ saved, currentQ, currentCategory }: { saved: SavedQuery[]; currentQ: string; currentCategory: string }) {
  const [name, setName] = useState('');
  const [pending, start] = useTransition();
  const router = useRouter();

  return (
    <div className="space-y-2">
      {currentQ ? (
        <div className="flex gap-2">
          <Input value={name} onChange={(e) => setName(e.target.value)} placeholder={`Name this search (default: "${currentQ}")`} className="h-8 max-w-[320px]" />
          <Button
            size="sm"
            variant="secondary"
            disabled={pending}
            onClick={() => start(async () => { await saveSearch(name, currentQ, currentCategory); setName(''); router.refresh(); })}
          >
            <Bookmark className="h-3.5 w-3.5" /> Save search
          </Button>
        </div>
      ) : null}

      {saved.length ? (
        <div className="flex flex-wrap items-center gap-2">
          <span className="text-xs text-muted-foreground">Saved:</span>
          {saved.map((s) => (
            <span key={s.id} className="inline-flex items-center gap-1 rounded-full border bg-background px-2 py-0.5 text-xs">
              <Link href={hrefFor(s)} className="hover:underline">{s.name}</Link>
              <button
                aria-label="delete saved query"
                className="text-muted-foreground hover:text-destructive"
                onClick={() => start(async () => { await removeSaved(s.id); router.refresh(); })}
              >
                <X className="h-3 w-3" />
              </button>
            </span>
          ))}
        </div>
      ) : null}
    </div>
  );
}
