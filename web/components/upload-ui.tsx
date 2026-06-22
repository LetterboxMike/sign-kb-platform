'use client';

import { useState } from 'react';
import Link from 'next/link';
import { UploadCloud, FileText, Check, AlertTriangle, Loader2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';

type Status = 'pending' | 'uploading' | 'extracting' | 'done' | 'error';
interface FileState {
  name: string;
  status: Status;
  staged?: number;
  flagged?: number;
  jobId?: string;
  error?: string;
}

async function ingestOne(file: File, onUpdate: (s: Partial<FileState>) => void): Promise<void> {
  onUpdate({ status: 'uploading' });
  const urlRes = await fetch('/api/ingest/upload-url', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ filename: file.name }),
  });
  const urlData = await urlRes.json();
  if (!urlRes.ok) throw new Error(urlData.error || 'could not get upload URL');

  const put = await fetch(urlData.signedUrl, {
    method: 'PUT',
    body: file,
    headers: { 'content-type': file.type || 'application/octet-stream', 'x-upsert': 'true' },
  });
  if (!put.ok) throw new Error(`upload failed (${put.status})`);

  onUpdate({ status: 'extracting' });
  const ingRes = await fetch('/api/ingest', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ key: urlData.key, filename: file.name }),
  });
  const ing = await ingRes.json();
  if (!ingRes.ok) throw new Error(ing.error || 'ingestion failed');
  onUpdate({ status: 'done', staged: ing.staged, flagged: ing.flagged?.length ?? 0, jobId: ing.jobId });
}

export function UploadUI() {
  const [files, setFiles] = useState<FileState[]>([]);
  const [busy, setBusy] = useState(false);

  async function handleFiles(list: FileList | null) {
    if (!list || !list.length || busy) return;
    const picked = Array.from(list);
    setFiles(picked.map((f) => ({ name: f.name, status: 'pending' as Status })));
    setBusy(true);
    for (let i = 0; i < picked.length; i++) {
      const update = (s: Partial<FileState>) => setFiles((prev) => prev.map((f, idx) => (idx === i ? { ...f, ...s } : f)));
      try {
        await ingestOne(picked[i], update);
      } catch (e) {
        update({ status: 'error', error: e instanceof Error ? e.message : 'failed' });
      }
    }
    setBusy(false);
  }

  const anyDone = files.some((f) => f.status === 'done');

  return (
    <div className="space-y-4">
      <label
        className={cn(
          'flex cursor-pointer flex-col items-center justify-center gap-2 rounded-lg border border-dashed p-10 text-center transition-colors',
          busy ? 'opacity-60' : 'hover:border-ring hover:bg-accent/40',
        )}
      >
        <UploadCloud className="h-6 w-6 text-muted-foreground" />
        <span className="text-sm font-medium">Drop sign drawings here or click to choose</span>
        <span className="text-xs text-muted-foreground">PDF, PNG, or JPEG · single or bulk</span>
        <input
          type="file"
          multiple
          accept="application/pdf,image/png,image/jpeg,image/webp"
          className="hidden"
          disabled={busy}
          onChange={(e) => handleFiles(e.target.files)}
        />
      </label>

      {files.length > 0 ? (
        <ul className="space-y-2">
          {files.map((f, i) => (
            <li key={i} className="flex items-center justify-between gap-3 rounded-md border p-3 text-sm">
              <span className="flex min-w-0 items-center gap-2">
                <FileText className="h-4 w-4 shrink-0 text-muted-foreground" />
                <span className="truncate">{f.name}</span>
              </span>
              <span className="flex shrink-0 items-center gap-2 text-xs">
                {f.status === 'uploading' ? (<><Loader2 className="h-3 w-3 animate-spin" /> uploading</>) : null}
                {f.status === 'extracting' ? (<><Loader2 className="h-3 w-3 animate-spin" /> extracting</>) : null}
                {f.status === 'done' ? (
                  <span className="flex items-center gap-1 text-foreground">
                    <Check className="h-3 w-3" /> {f.staged} staged{f.flagged ? `, ${f.flagged} flagged` : ''}
                  </span>
                ) : null}
                {f.status === 'error' ? (
                  <span className="flex items-center gap-1 text-destructive">
                    <AlertTriangle className="h-3 w-3" /> {f.error}
                  </span>
                ) : null}
              </span>
            </li>
          ))}
        </ul>
      ) : null}

      {anyDone ? (
        <Link href="/review" className="inline-flex items-center text-sm font-medium underline-offset-2 hover:underline">
          → Review staged candidates
        </Link>
      ) : null}
    </div>
  );
}
