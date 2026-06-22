'use client';

import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { Wand2, Check, X, AlertTriangle, Loader2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { propose, approve } from '@/app/corrections/actions';
import type { CorrectionProposal, ApplyResult } from '@/lib/kb';

export function CorrectionsUI() {
  const [prompt, setPrompt] = useState('');
  const [proposal, setProposal] = useState<CorrectionProposal | null>(null);
  const [result, setResult] = useState<ApplyResult | null>(null);
  const [phase, setPhase] = useState<'idle' | 'proposing' | 'applying'>('idle');
  const [error, setError] = useState<string | null>(null);
  const [, start] = useTransition();
  const router = useRouter();

  function doPropose() {
    const p = prompt.trim();
    if (!p || phase !== 'idle') return;
    setError(null);
    setResult(null);
    setProposal(null);
    setPhase('proposing');
    start(async () => {
      try {
        setProposal(await propose(p));
      } catch (e) {
        setError(e instanceof Error ? e.message : 'propose failed');
      } finally {
        setPhase('idle');
      }
    });
  }

  function doApprove() {
    if (!proposal || phase !== 'idle') return;
    setError(null);
    setPhase('applying');
    start(async () => {
      try {
        const r = await approve(proposal.correctionId);
        setResult(r);
        setProposal(null);
        router.refresh();
      } catch (e) {
        setError(e instanceof Error ? e.message : 'apply failed');
      } finally {
        setPhase('idle');
      }
    });
  }

  function reset() {
    setPrompt('');
    setProposal(null);
    setResult(null);
    setError(null);
  }

  return (
    <Card>
      <CardHeader className="pb-3">
        <CardTitle className="flex items-center gap-2 text-base">
          <Wand2 className="h-4 w-4" /> Propose a correction
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        <Textarea
          value={prompt}
          onChange={(e) => setPrompt(e.target.value)}
          placeholder="Describe what's wrong and how it should change, e.g. “The board-formed concrete monument should note the halo lighting is warm white, not cool white.”"
          rows={3}
          disabled={phase !== 'idle'}
        />
        <div className="flex gap-2">
          <Button onClick={doPropose} disabled={phase !== 'idle' || !prompt.trim()}>
            {phase === 'proposing' ? <Loader2 className="h-4 w-4 animate-spin" /> : <Wand2 className="h-4 w-4" />} Propose
          </Button>
          {(proposal || result) && phase === 'idle' ? (
            <Button variant="ghost" onClick={reset}>
              Clear
            </Button>
          ) : null}
        </div>

        {error ? <p className="text-sm text-destructive">{error}</p> : null}

        {proposal ? (
          <div className="space-y-3 rounded-md border p-3">
            {proposal.changeSet.length === 0 ? (
              <p className="text-sm text-muted-foreground">The model proposed no changes for that request.</p>
            ) : (
              <>
                <div className="text-sm font-medium">Proposed change set ({proposal.changeSet.length} edit{proposal.changeSet.length === 1 ? '' : 's'})</div>
                {proposal.perRecord.map((pr) => (
                  <div key={pr.record_id} className="rounded border p-2">
                    <div className="flex items-center justify-between">
                      <span className="font-mono text-xs">{pr.record_id}</span>
                      {pr.valid ? <Badge variant="secondary">valid</Badge> : <Badge variant="destructive">invalid</Badge>}
                    </div>
                    {pr.entries.map((e, i) => (
                      <div key={i} className="mt-1 text-xs">
                        <span className="text-muted-foreground">{e.path}</span>:{' '}
                        <span className="text-destructive line-through">{JSON.stringify(e.before)}</span>{' → '}
                        <span className="text-emerald-600 dark:text-emerald-400">{JSON.stringify(e.after)}</span>
                      </div>
                    ))}
                    {!pr.valid ? <div className="mt-1 text-xs text-destructive">{pr.errors.slice(0, 3).join('; ')}</div> : null}
                    {pr.staleEntries.length ? (
                      <div className="mt-1 flex items-center gap-1 text-xs text-amber-600">
                        <AlertTriangle className="h-3 w-3" /> stale: {pr.staleEntries.join(', ')} (current value differs from “before”)
                      </div>
                    ) : null}
                  </div>
                ))}
                <Button onClick={doApprove} disabled={phase !== 'idle' || !proposal.allValid}>
                  {phase === 'applying' ? (<><Loader2 className="h-4 w-4 animate-spin" /> applying + running eval…</>) : (<><Check className="h-4 w-4" /> Approve, commit & eval-gate</>)}
                </Button>
                {!proposal.allValid ? <p className="text-xs text-destructive">Can&apos;t approve — some records would fail the schema gate.</p> : null}
              </>
            )}
          </div>
        ) : null}

        {result ? (
          <div className={`rounded-md border p-3 text-sm ${result.status === 'approved' ? '' : 'border-destructive/40'}`}>
            {result.status === 'approved' ? (
              <p className="flex items-center gap-1 font-medium text-emerald-600 dark:text-emerald-400">
                <Check className="h-4 w-4" /> Committed — eval passed, audit + revert recorded.
              </p>
            ) : (
              <p className="flex items-center gap-1 font-medium text-destructive">
                <X className="h-4 w-4" /> Rejected & auto-reverted — {result.error ?? result.evalReasons.join('; ')}
              </p>
            )}
            {result.metrics ? (
              <p className="mt-1 text-xs text-muted-foreground">
                eval: hit@5 {result.metrics.hit5}/{result.metrics.records}, hit@10 {result.metrics.hit10}/{result.metrics.records}, canon {result.metrics.canonHit5}/{result.metrics.canon}
              </p>
            ) : null}
          </div>
        ) : null}
      </CardContent>
    </Card>
  );
}
