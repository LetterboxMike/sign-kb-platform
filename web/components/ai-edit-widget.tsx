'use client';

import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { Sparkles, Check, X, Loader2, AlertTriangle } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { proposeRecordEdit, approveFieldEdit } from '@/app/record/actions';
import type { CorrectionProposal, ApplyResult } from '@/lib/kb';

const CHIPS = [
  'Fix the illumination method',
  'Tighten the plain-language summary',
  'Correct the mounting type',
  'Clarify the rationale',
];

/** Conversational, clarify-first AI edit widget scoped to a single record. It asks the model for a
 *  precise change set on THIS record only, shows the diff + schema validity, and commits through the
 *  governed correction workflow on approval (eval-gated, audited, revertible) — never a silent write. */
export function AiEditWidget({ recordId }: { recordId: string; status: string | null }) {
  const [prompt, setPrompt] = useState('');
  const [proposal, setProposal] = useState<CorrectionProposal | null>(null);
  const [result, setResult] = useState<ApplyResult | null>(null);
  const [phase, setPhase] = useState<'idle' | 'proposing' | 'applying'>('idle');
  const [error, setError] = useState<string | null>(null);
  const [, start] = useTransition();
  const router = useRouter();

  function ask(p: string) {
    const text = p.trim();
    if (!text || phase !== 'idle') return;
    setError(null);
    setResult(null);
    setProposal(null);
    setPrompt(text);
    setPhase('proposing');
    start(async () => {
      try {
        setProposal(await proposeRecordEdit(recordId, text));
      } catch (e) {
        setError(e instanceof Error ? e.message : 'propose failed');
      } finally {
        setPhase('idle');
      }
    });
  }

  function approve() {
    if (!proposal || phase !== 'idle') return;
    setError(null);
    setPhase('applying');
    start(async () => {
      try {
        const r = await approveFieldEdit(proposal.correctionId, recordId);
        setResult(r);
        if (r.status === 'approved') {
          setProposal(null);
          router.refresh();
        }
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
          <Sparkles className="h-4 w-4" /> Edit with AI
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-3">
        <p className="text-sm text-muted-foreground">
          Describe a change in plain language. I’ll propose a precise edit to this record, show the diff, and only commit
          after you approve.
        </p>
        <form
          onSubmit={(e) => {
            e.preventDefault();
            ask(prompt);
          }}
          className="flex gap-2"
        >
          <Input
            value={prompt}
            onChange={(e) => setPrompt(e.target.value)}
            placeholder="e.g. the halo lighting is warm white, not cool white"
            disabled={phase !== 'idle'}
          />
          <Button type="submit" disabled={phase !== 'idle' || !prompt.trim()}>
            {phase === 'proposing' ? <Loader2 className="h-4 w-4 animate-spin" /> : <Sparkles className="h-4 w-4" />} Propose
          </Button>
        </form>

        {!proposal && !result ? (
          <div className="flex flex-wrap gap-2">
            {CHIPS.map((c) => (
              <button
                key={c}
                onClick={() => ask(c)}
                disabled={phase !== 'idle'}
                className="rounded-full border bg-background px-3 py-1 text-xs font-medium transition-colors hover:bg-accent disabled:opacity-50"
              >
                {c}
              </button>
            ))}
          </div>
        ) : null}

        {error ? <p className="text-sm text-destructive">{error}</p> : null}

        {proposal ? (
          <div className="space-y-3 rounded-md border p-3">
            {proposal.changeSet.length === 0 ? (
              <div className="space-y-2">
                <p className="text-sm text-muted-foreground">I couldn’t find a precise change for that. Try being more specific about the field and value.</p>
                <Button size="sm" variant="ghost" onClick={reset}>
                  Clear
                </Button>
              </div>
            ) : (
              <>
                <div className="text-sm font-medium">
                  Proposed {proposal.changeSet.length} edit{proposal.changeSet.length === 1 ? '' : 's'}
                </div>
                {proposal.perRecord.map((pr) => (
                  <div key={pr.record_id} className="rounded border p-2">
                    <div className="flex items-center justify-between">
                      <span className="font-mono text-xs">{pr.record_id}</span>
                      {pr.valid ? <Badge variant="secondary">valid</Badge> : <Badge variant="destructive">invalid</Badge>}
                    </div>
                    {pr.entries.map((en, i) => (
                      <div key={i} className="mt-1 text-xs">
                        <span className="text-muted-foreground">{en.path}</span>:{' '}
                        <span className="text-destructive line-through">{JSON.stringify(en.before)}</span>{' → '}
                        <span className="text-emerald-600 dark:text-emerald-400">{JSON.stringify(en.after)}</span>
                      </div>
                    ))}
                    {!pr.valid ? <div className="mt-1 text-xs text-destructive">{pr.errors.slice(0, 3).join('; ')}</div> : null}
                    {pr.staleEntries.length ? (
                      <div className="mt-1 flex items-center gap-1 text-xs text-amber-600">
                        <AlertTriangle className="h-3 w-3" /> stale: {pr.staleEntries.join(', ')}
                      </div>
                    ) : null}
                  </div>
                ))}
                <div className="flex gap-2">
                  <Button onClick={approve} disabled={phase !== 'idle' || !proposal.allValid}>
                    {phase === 'applying' ? (
                      <>
                        <Loader2 className="h-4 w-4 animate-spin" /> applying + eval…
                      </>
                    ) : (
                      <>
                        <Check className="h-4 w-4" /> Approve &amp; commit
                      </>
                    )}
                  </Button>
                  <Button variant="ghost" onClick={reset} disabled={phase !== 'idle'}>
                    Discard
                  </Button>
                </div>
                {!proposal.allValid ? (
                  <p className="text-xs text-destructive">Can’t approve — the change would fail the schema gate.</p>
                ) : null}
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
                <X className="h-4 w-4" /> Rejected &amp; auto-reverted — {result.error ?? result.evalReasons.join('; ')}
              </p>
            )}
          </div>
        ) : null}
      </CardContent>
    </Card>
  );
}
