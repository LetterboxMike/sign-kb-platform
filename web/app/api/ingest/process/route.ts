import { NextResponse } from 'next/server';
import { claimNextJob, completeJob, failJob, stageFromBuffer, pendingJobCount } from '@/lib/kb';
import { downloadDrawing, storageConfigured } from '@/lib/storage';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const maxDuration = 300;

interface ProcessedJob {
  id: string;
  status: 'review' | 'done' | 'failed';
  staged?: number;
  flagged?: number;
  filename?: string | null;
  error?: string;
}

/** Claim and process exactly one workable job. Returns null if none is claimable right now. */
async function processOne(): Promise<ProcessedJob | null> {
  const job = await claimNextJob();
  if (!job) return null;
  try {
    if (!job.source_path) throw new Error('job has no source_path');
    const pdf = await downloadDrawing(job.source_path);
    const staged = await stageFromBuffer(pdf, job.source_filename ?? job.source_path, { uploadedBy: job.uploaded_by });
    const status = await completeJob(job.id, staged);
    return { id: job.id, status, staged: staged.candidateRecordIds.length, flagged: staged.flagged.length, filename: job.source_filename };
  } catch (e) {
    const error = e instanceof Error ? e.message : 'processing failed';
    await failJob(job.id, error);
    return { id: job.id, status: 'failed', error, filename: job.source_filename };
  }
}

// Client-driven: process one job per call so the UI shows fine-grained progress and each call
// stays well under the function time limit. Re-callable — resumes the queue after any interruption.
export async function POST() {
  if (!storageConfigured()) {
    return NextResponse.json({ error: 'Storage not configured.' }, { status: 503 });
  }
  const job = await processOne();
  const remaining = await pendingJobCount();
  return NextResponse.json({ processed: Boolean(job), job, remaining });
}

// Cron-driven drain: process a bounded batch within the time budget. Protected by CRON_SECRET
// when set (so it's safe once deployed; open locally where the secret is unset).
export async function GET(req: Request) {
  if (!storageConfigured()) {
    return NextResponse.json({ error: 'Storage not configured.' }, { status: 503 });
  }
  const secret = process.env.CRON_SECRET;
  if (secret && req.headers.get('authorization') !== `Bearer ${secret}`) {
    return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  }
  try {
    const processed: ProcessedJob[] = [];
    for (let i = 0; i < 10; i++) {
      const job = await processOne();
      if (!job) break;
      processed.push(job);
    }
    const remaining = await pendingJobCount();
    return NextResponse.json({ processed: processed.length, jobs: processed, remaining });
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : 'processing failed' }, { status: 500 });
  }
}
