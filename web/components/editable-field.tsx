'use client';

import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { Pencil, Check, X, Loader2, AlertTriangle } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Badge } from '@/components/ui/badge';
import { proposeFieldEdit, approveFieldEdit, directEdit } from '@/app/record/actions';
import type { CorrectionProposal, ApplyResult } from '@/lib/kb';

type Kind = 'text' | 'textarea' | 'enum';

interface Props {
  recordId: string;
  status: string | null;
  path: string; // dot-path into the record raw, e.g. classification.illumination_method
  label: string;
  value: string | null;
  kind?: Kind;
  options?: string[];
}

function msg(e: unknown): string {
  return e instanceof Error ? e.message : 'failed';
}

/** A single field rendered read-only with an edit affordance. Live records edit through the
 *  governed correction workflow (propose → diff → approve, eval-gated); staging records edit
 *  directly through the schema gate. */
export function EditableField({ recordId, status, path, label, value, kind = 'text', options = [] }: Props) {
  const live = status === 'live';
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(value ?? '');
  const [proposal, setProposal] = useState<CorrectionProposal | null>(null);
  const [result, setResult] = useState<ApplyResult | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [phase, setPhase] = useState<'idle' | 'proposing' | 'applying' | 'saving'>('idle');
  const [, start] = useTransition();
  const router = useRouter();

  function begin() {
    setEditing(true);
    setDraft(value ?? '');
    setProposal(null);
    setResult(null);
    setError(null);
  }
  function cancel() {
    setEditing(false);
    setProposal(null);
    setError(null);
    setPhase('idle');
  }

  function save() {
    const after = draft.trim();
    if (after === (value ?? '').trim()) {
      cancel();
      return;
    }
    setError(null);
    start(async () => {
      if (live) {
        setPhase('proposing');
        try {
          setProposal(await proposeFieldEdit(recordId, path, value ?? null, after));
        } catch (e) {
          setError(msg(e));
        } finally {
          setPhase('idle');
        }
      } else {
        setPhase('saving');
        try {
          const r = await directEdit(recordId, path, after);
          if (r.ok) {
            setEditing(false);
            router.refresh();
          } else setError(r.error ?? 'failed');
        } catch (e) {
          setError(msg(e));
        } finally {
          setPhase('idle');
        }
      }
    });
  }

  function approve() {
    if (!proposal) return;
    setError(null);
    start(async () => {
      setPhase('applying');
      try {
        const r = await approveFieldEdit(proposal.correctionId, recordId);
        setResult(r);
        if (r.status === 'approved') {
          setProposal(null);
          setEditing(false);
          router.refresh();
        }
      } catch (e) {
        setError(msg(e));
      } finally {
        setPhase('idle');
      }
    });
  }

  const preview = proposal?.perRecord?.[0];

  return (
    <div className="group flex flex-col gap-0.5">
      <dt className="flex items-center gap-1.5 text-xs uppercase tracking-wide text-muted-foreground">
        {label.replaceAll('_', ' ')}
        {!editing ? (
          <button
            onClick={begin}
            className="opacity-0 transition-opacity group-hover:opacity-100"
            aria-label={`Edit ${label}`}
          >
            <Pencil className="h-3 w-3" />
          </button>
        ) : null}
      </dt>

      {!editing ? (
        <dd className="text-sm">{value ? value.replaceAll('_', ' ') : <span className="text-muted-foreground">—</span>}</dd>
      ) : (
        <dd className="mt-1 space-y-2">
          <div className="flex flex-wrap items-center gap-2">
            {kind === 'enum' && options.length ? (
              <select
                value={draft}
                onChange={(e) => setDraft(e.target.value)}
                className="h-8 rounded-md border border-input bg-background px-2 text-sm"
                disabled={phase !== 'idle'}
              >
                <option value="">—</option>
                {options.map((o) => (
                  <option key={o} value={o}>
                    {o.replaceAll('_', ' ')}
                  </option>
                ))}
              </select>
            ) : kind === 'textarea' ? (
              <Textarea value={draft} onChange={(e) => setDraft(e.target.value)} rows={3} className="w-full" disabled={phase !== 'idle'} />
            ) : (
              <Input value={draft} onChange={(e) => setDraft(e.target.value)} className="h-8 max-w-[320px]" disabled={phase !== 'idle'} />
            )}
            {!proposal ? (
              <>
                <Button size="sm" onClick={save} disabled={phase !== 'idle'}>
                  {phase === 'proposing' || phase === 'saving' ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Check className="h-3.5 w-3.5" />}
                  {live ? 'Propose' : 'Save'}
                </Button>
                <Button size="sm" variant="ghost" onClick={cancel} disabled={phase !== 'idle'}>
                  <X className="h-3.5 w-3.5" /> Cancel
                </Button>
              </>
            ) : null}
          </div>

          {/* Live-edit proposal preview: diff + schema validity, then explicit approve. */}
          {proposal ? (
            <div className="space-y-2 rounded-md border p-2 text-xs">
              {proposal.changeSet.length === 0 ? (
                <p className="text-muted-foreground">No change detected.</p>
              ) : (
                <>
                  <div>
                    <span className="text-muted-foreground">{path}</span>:{' '}
                    <span className="text-destructive line-through">{JSON.stringify(preview?.entries?.[0]?.before)}</span>{' → '}
                    <span className="text-emerald-600 dark:text-emerald-400">{JSON.stringify(preview?.entries?.[0]?.after)}</span>{' '}
                    {preview?.valid ? <Badge variant="secondary">valid</Badge> : <Badge variant="destructive">invalid</Badge>}
                  </div>
                  {preview && !preview.valid ? <div className="text-destructive">{preview.errors.slice(0, 2).join('; ')}</div> : null}
                  {preview?.staleEntries.length ? (
                    <div className="flex items-center gap-1 text-amber-600">
                      <AlertTriangle className="h-3 w-3" /> value changed since load — reload before approving
                    </div>
                  ) : null}
                  <div className="flex gap-2">
                    <Button size="sm" onClick={approve} disabled={phase !== 'idle' || !proposal.allValid}>
                      {phase === 'applying' ? (
                        <>
                          <Loader2 className="h-3.5 w-3.5 animate-spin" /> applying + eval…
                        </>
                      ) : (
                        <>
                          <Check className="h-3.5 w-3.5" /> Approve &amp; commit
                        </>
                      )}
                    </Button>
                    <Button size="sm" variant="ghost" onClick={cancel} disabled={phase !== 'idle'}>
                      Cancel
                    </Button>
                  </div>
                </>
              )}
            </div>
          ) : null}

          {result && result.status === 'rejected' ? (
            <p className="text-xs text-destructive">
              Rejected &amp; auto-reverted — {result.error ?? result.evalReasons.join('; ')}
            </p>
          ) : null}
          {error ? <p className="text-xs text-destructive">{error}</p> : null}
        </dd>
      )}
    </div>
  );
}
