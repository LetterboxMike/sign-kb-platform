'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { FlaskConical, Check, Loader2, AlertTriangle } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { research, save } from '@/app/reference/actions';
import type { ReferenceLayerEntry, ReferenceProposal } from '@/lib/kb';

export function ReferenceAdd({ canPublish = true }: { canPublish?: boolean }) {
  const [name, setName] = useState('');
  const [notes, setNotes] = useState('');
  const [proposal, setProposal] = useState<ReferenceProposal | null>(null);
  const [phase, setPhase] = useState<'idle' | 'researching' | 'saving'>('idle');
  const [saved, setSaved] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const router = useRouter();

  async function doResearch() {
    if (!name.trim() || phase !== 'idle') return;
    setError(null);
    setSaved(null);
    setProposal(null);
    setPhase('researching');
    try {
      setProposal(await research(name.trim(), notes.trim() || undefined));
    } catch (e) {
      setError(e instanceof Error ? e.message : 'research failed');
    } finally {
      setPhase('idle');
    }
  }

  async function doSave(entry: ReferenceLayerEntry) {
    setPhase('saving');
    setError(null);
    try {
      const r = await save(entry);
      setSaved(`${r} ${entry.normalized_id}`);
      setProposal(null);
      setName('');
      setNotes('');
      router.refresh();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'save failed');
    } finally {
      setPhase('idle');
    }
  }

  const e = proposal?.entry;
  return (
    <Card>
      <CardHeader className="pb-3">
        <CardTitle className="flex items-center gap-2 text-base">
          <FlaskConical className="h-4 w-4" /> Research &amp; add a manufacturer / material
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-3">
        <div className="flex flex-col gap-2 sm:flex-row">
          <Input value={name} onChange={(ev) => setName(ev.target.value)} placeholder="e.g. 3M IJ180 cast vinyl, or SloanLED modules" disabled={phase !== 'idle'} />
          <Input value={notes} onChange={(ev) => setNotes(ev.target.value)} placeholder="optional notes" className="sm:max-w-[220px]" disabled={phase !== 'idle'} />
          <Button onClick={doResearch} disabled={phase !== 'idle' || !name.trim()}>
            {phase === 'researching' ? <Loader2 className="h-4 w-4 animate-spin" /> : <FlaskConical className="h-4 w-4" />} Research
          </Button>
        </div>

        {error ? <p className="text-sm text-destructive">{error}</p> : null}
        {saved ? <p className="flex items-center gap-1 text-sm text-emerald-600 dark:text-emerald-400"><Check className="h-4 w-4" /> {saved}</p> : null}

        {e ? (
          <div className="space-y-2 rounded-md border p-3 text-sm">
            <div className="flex items-center gap-2">
              <span className="font-mono text-xs">{e.normalized_id}</span>
              {e.category ? <Badge variant="secondary">{e.category}</Badge> : null}
              {proposal?.exists ? <Badge variant="outline">updates existing</Badge> : <Badge variant="outline">new</Badge>}
            </div>
            <div className="font-medium">{e.company ?? e.product}</div>
            {e.knowledge ? <p className="text-muted-foreground">{e.knowledge}</p> : null}
            {e.optical_behavior ? (
              <div className="text-xs"><span className="text-muted-foreground">optical_behavior: </span><span className="font-mono">{JSON.stringify(e.optical_behavior)}</span></div>
            ) : null}
            {proposal!.issues.length ? (
              <div className="flex items-center gap-1 text-xs text-destructive"><AlertTriangle className="h-3 w-3" /> {proposal!.issues.join('; ')}</div>
            ) : null}
            {canPublish ? (
              <Button onClick={() => doSave(e)} disabled={phase !== 'idle' || proposal!.issues.length > 0}>
                {phase === 'saving' ? <Loader2 className="h-4 w-4 animate-spin" /> : <Check className="h-4 w-4" />} Save to reference
              </Button>
            ) : (
              <p className="text-xs text-muted-foreground">An admin approves and saves researched entries to the reference layer.</p>
            )}
          </div>
        ) : null}
      </CardContent>
    </Card>
  );
}
