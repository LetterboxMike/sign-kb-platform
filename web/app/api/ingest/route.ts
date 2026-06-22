import { NextResponse } from 'next/server';
import { ingestPdf } from '@/lib/kb';
import { downloadDrawing, storageConfigured } from '@/lib/storage';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const maxDuration = 300; // extraction can take a while on multi-page drawings

// Step 2 of upload: the file is already in storage; download it server-side and run ingestion.
export async function POST(req: Request) {
  if (!storageConfigured()) {
    return NextResponse.json({ error: 'Storage not configured (SUPABASE_SERVICE_ROLE_KEY missing).' }, { status: 503 });
  }
  try {
    const { key, filename } = (await req.json()) as { key?: unknown; filename?: unknown };
    if (typeof key !== 'string' || !key) return NextResponse.json({ error: 'storage key required' }, { status: 400 });
    const name = typeof filename === 'string' && filename ? filename : key;

    const pdf = await downloadDrawing(key);
    const result = await ingestPdf(pdf, name, { sourcePath: key });
    return NextResponse.json(result);
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : 'ingestion failed' }, { status: 500 });
  }
}
