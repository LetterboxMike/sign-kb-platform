'use client';

import { useState, type DragEvent } from 'react';
import Link from 'next/link';
import { UploadCloud, FileText, Check, AlertTriangle, Loader2, Clock, RefreshCw } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';

type Status = 'pending' | 'uploading' | 'queued' | 'extracting' | 'done' | 'error';
interface FileState {
  name: string;
  jobId?: string;
  status: Status;
  staged?: number;
  flagged?: number;
  error?: string;
}

// Browsers sometimes report an empty or generic file.type for PDFs; derive a sane content-type
// from the extension so Supabase Storage's MIME check accepts the upload.
function contentTypeFor(file: File): string {
  if (file.type) return file.type;
  const ext = file.name.toLowerCase().split('.').pop() ?? '';
  const map: Record<string, string> = {
    pdf: 'application/pdf',
    png: 'image/png',
    jpg: 'image/jpeg',
    jpeg: 'image/jpeg',
    webp: 'image/webp',
    tif: 'image/tiff',
    tiff: 'image/tiff',
  };
  return map[ext] ?? 'application/octet-stream';
}

// Step 1: file -> storage (signed URL) -> enqueue a durable 'queued' job. Survives a crash here.
async function uploadAndEnqueue(file: File): Promise<string> {
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
    headers: { 'content-type': contentTypeFor(file), 'x-upsert': 'true' },
  });
  if (!put.ok) throw new Error(`upload failed (${put.status})`);

  const enq = await fetch('/api/ingest/enqueue', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ key: urlData.key, filename: file.name }),
  });
  const enqData = await enq.json();
  if (!enq.ok) throw new Error(enqData.error || 'enqueue failed');
  return enqData.jobId as string;
}

// Soft client-side guard: above this the extraction model call tends to time out. We warn but
// still allow the upload — the server surfaces the real error if it does fail.
const SOFT_MAX_BYTES = 25 * 1024 * 1024; // 25 MB

export function UploadUI({ initialPending }: { initialPending: number }) {
  const [files, setFiles] = useState<FileState[]>([]);
  const [busy, setBusy] = useState(false);
  const [pending, setPending] = useState(initialPending);
  const [drainNote, setDrainNote] = useState<string | null>(null);
  const [dragActive, setDragActive] = useState(false);

  // Step 2: drain the queue one job per call (resumable). Updates matching files by jobId.
  async function drain() {
    for (;;) {
      const res = await fetch('/api/ingest/process', { method: 'POST' });
      const data = await res.json();
      if (!res.ok) {
        setDrainNote(data.error || 'processing failed');
        break;
      }
      setPending(data.remaining ?? 0);
      if (!data.processed) break;
      const j = data.job;
      setFiles((prev) =>
        prev.map((f) =>
          f.jobId === j.id
            ? { ...f, status: j.status === 'failed' ? 'error' : 'done', staged: j.staged, flagged: j.flagged, error: j.error }
            : f,
        ),
      );
    }
  }

  async function handleFiles(list: FileList | null) {
    if (!list || !list.length || busy) return;
    const picked = Array.from(list);
    setFiles(picked.map((f) => ({ name: f.name, status: 'pending' as Status })));
    setBusy(true);
    const oversize = picked.filter((f) => f.size > SOFT_MAX_BYTES);
    setDrainNote(
      oversize.length
        ? `Heads up: ${oversize.map((f) => f.name).join(', ')} ${oversize.length === 1 ? 'is' : 'are'} large (>25 MB) and may time out during extraction. Try one sheet at a time if it fails.`
        : null,
    );
    // Upload + enqueue all first (fast, durable), then process.
    for (let i = 0; i < picked.length; i++) {
      const update = (s: Partial<FileState>) => setFiles((prev) => prev.map((f, idx) => (idx === i ? { ...f, ...s } : f)));
      try {
        update({ status: 'uploading' });
        const jobId = await uploadAndEnqueue(picked[i]);
        update({ status: 'queued', jobId });
      } catch (e) {
        update({ status: 'error', error: e instanceof Error ? e.message : 'failed' });
      }
    }
    await drain();
    setBusy(false);
  }

  async function processPending() {
    if (busy) return;
    setBusy(true);
    setDrainNote(null);
    await drain();
    setDrainNote('Processed pending jobs.');
    setBusy(false);
  }

  function onDragOver(e: DragEvent) {
    e.preventDefault();
    if (!busy && !dragActive) setDragActive(true);
  }
  function onDragLeave(e: DragEvent) {
    e.preventDefault();
    // Ignore leaves into child elements; only clear when leaving the dropzone itself.
    if (e.currentTarget.contains(e.relatedTarget as Node)) return;
    setDragActive(false);
  }
  function onDrop(e: DragEvent) {
    e.preventDefault();
    setDragActive(false);
    if (busy) return;
    handleFiles(e.dataTransfer.files);
  }

  const anyDone = files.some((f) => f.status === 'done');

  return (
    <div className="space-y-4">
      {pending > 0 ? (
        <div className="flex items-center justify-between gap-3 rounded-md border bg-muted/40 p-3 text-sm">
          <span className="flex items-center gap-2">
            <Clock className="h-4 w-4 text-muted-foreground" /> {pending} job{pending === 1 ? '' : 's'} queued (from this or a
            prior session)
          </span>
          <Button size="sm" variant="secondary" onClick={processPending} disabled={busy}>
            <RefreshCw className={cn('h-3.5 w-3.5', busy && 'animate-spin')} /> Process pending
          </Button>
        </div>
      ) : null}

      <label
        onDragOver={onDragOver}
        onDragEnter={onDragOver}
        onDragLeave={onDragLeave}
        onDrop={onDrop}
        className={cn(
          'flex cursor-pointer flex-col items-center justify-center gap-2 rounded-lg border border-dashed p-10 text-center transition-colors',
          busy ? 'opacity-60' : 'hover:border-ring hover:bg-accent/40',
          dragActive && !busy ? 'border-ring bg-accent/60 ring-2 ring-ring/40' : '',
        )}
      >
        <UploadCloud className="h-6 w-6 text-muted-foreground" />
        <span className="text-sm font-medium">Drop sign drawings here or click to choose</span>
        <span className="text-xs text-muted-foreground">PDF, PNG, or JPEG · single or bulk · uploads are queued durably</span>
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
                {f.status === 'queued' ? (<><Clock className="h-3 w-3" /> queued</>) : null}
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

      {drainNote ? <p className="text-xs text-muted-foreground">{drainNote}</p> : null}

      {anyDone || initialPending > 0 ? (
        <Link href="/review" className="inline-flex items-center text-sm font-medium underline-offset-2 hover:underline">
          → Review staged candidates
        </Link>
      ) : null}
    </div>
  );
}
