'use client';

import { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { submitComparison, runRollup, type Winner } from '@/app/ranker/actions';
import type { RankerCard } from '@/lib/queries';

function SignPanel({ card, onPick, label }: { card: RankerCard; onPick: () => void; label: string }) {
  return (
    <Card className="flex flex-col">
      <CardHeader className="pb-2">
        <div className="flex items-center justify-between">
          <CardTitle className="text-base capitalize">
            {(card.sign_category ?? card.record_type).replaceAll('_', ' ')}
          </CardTitle>
          <kbd className="rounded border bg-muted px-1.5 text-xs text-muted-foreground">{label}</kbd>
        </div>
        {card.sub_type ? <div className="text-xs text-muted-foreground">{card.sub_type.replaceAll('_', ' ')}</div> : null}
      </CardHeader>
      <CardContent className="flex flex-1 flex-col gap-3">
        <p className="flex-1 text-sm leading-relaxed text-muted-foreground">
          {card.summary ?? 'No summary on this record.'}
        </p>
        <div className="flex items-center justify-between">
          <Link
            href={`/record/${encodeURIComponent(card.record_id)}`}
            target="_blank"
            className="font-mono text-[11px] text-muted-foreground hover:text-foreground"
          >
            {card.record_id}
          </Link>
          <Button onClick={onPick}>Better</Button>
        </div>
      </CardContent>
    </Card>
  );
}

export function RankerUI({
  initialPair,
  initialCount,
  canRollup = true,
}: {
  initialPair: RankerCard[];
  initialCount: number;
  canRollup?: boolean;
}) {
  const [pair, setPair] = useState<RankerCard[]>(initialPair);
  const [count, setCount] = useState(initialCount);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [rollup, setRollup] = useState<{ graded: number; comparisons: number; distribution: Record<string, number> } | null>(null);

  const choose = useCallback(
    async (winner: Winner) => {
      if (busy || pair.length < 2) return;
      setBusy(true);
      setError(null);
      try {
        const next = await submitComparison(pair[0].record_id, pair[1].record_id, winner);
        if (winner !== 'skip') setCount((c) => c + 1);
        setPair(next);
        setRollup(null);
      } catch (e) {
        setError(e instanceof Error ? e.message : 'Failed to record comparison.');
      } finally {
        setBusy(false);
      }
    },
    [busy, pair],
  );

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === '1') choose('record_a');
      else if (e.key === '2') choose('record_b');
      else if (e.key.toLowerCase() === 's') choose('skip');
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [choose]);

  async function doRollup() {
    setBusy(true);
    setError(null);
    try {
      setRollup(await runRollup());
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Roll-up failed.');
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between text-sm text-muted-foreground">
        <span>
          Which is the stronger design? <span className="text-foreground tabular-nums">{count}</span> comparisons recorded.
        </span>
        <span className="hidden sm:inline">keys: 1 · 2 · s (skip)</span>
      </div>

      {pair.length === 2 ? (
        <div className="grid items-stretch gap-4 sm:grid-cols-2">
          <SignPanel card={pair[0]} label="1" onPick={() => choose('record_a')} />
          <SignPanel card={pair[1]} label="2" onPick={() => choose('record_b')} />
        </div>
      ) : (
        <p className="text-sm text-muted-foreground">Not enough records to compare.</p>
      )}

      <div className="flex flex-wrap items-center gap-3">
        <Button variant="ghost" onClick={() => choose('skip')} disabled={busy}>
          Skip
        </Button>
        {canRollup ? (
          <Button variant="secondary" onClick={doRollup} disabled={busy}>
            Roll up grades
          </Button>
        ) : null}
        {error ? <span className="text-sm text-destructive">{error}</span> : null}
      </div>

      {rollup ? (
        <div className="rounded-lg border p-4 text-sm">
          <div className="font-medium">
            Graded {rollup.graded} record{rollup.graded === 1 ? '' : 's'} from {rollup.comparisons} comparisons.
          </div>
          <div className="mt-2 flex flex-wrap gap-2">
            {Object.entries(rollup.distribution).map(([g, n]) => (
              <Badge key={g} variant="outline">
                {g}: {n}
              </Badge>
            ))}
          </div>
          <p className="mt-2 text-xs text-muted-foreground">
            Grades are written to quality_grade. Run <span className="font-mono">npm run export</span> to refresh the JSON
            layer.
          </p>
        </div>
      ) : null}
    </div>
  );
}
