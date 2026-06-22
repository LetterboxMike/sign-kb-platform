import { NextResponse } from 'next/server';
import { enqueueJob } from '@/lib/kb';
import { storageConfigured } from '@/lib/storage';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

// Durable enqueue: the file is already in storage; record a 'queued' job that survives a restart.
// Processing happens separately (POST /api/ingest/process), so a dropped connection or crash
// after this point never loses the work.
export async function POST(req: Request) {
  if (!storageConfigured()) {
    return NextResponse.json({ error: 'Storage not configured (SUPABASE_SERVICE_ROLE_KEY missing).' }, { status: 503 });
  }
  try {
    const { key, filename } = (await req.json()) as { key?: unknown; filename?: unknown };
    if (typeof key !== 'string' || !key) return NextResponse.json({ error: 'storage key required' }, { status: 400 });
    const jobId = await enqueueJob({ filename: typeof filename === 'string' && filename ? filename : key, sourcePath: key });
    return NextResponse.json({ jobId, status: 'queued' });
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : 'enqueue failed' }, { status: 500 });
  }
}
