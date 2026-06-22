import { NextResponse } from 'next/server';
import { createSignedUpload, storageConfigured } from '@/lib/storage';
import { guardRoute } from '@/lib/auth';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

// Step 1 of upload: hand the browser a signed URL it PUTs the file to directly.
export async function POST(req: Request) {
  const gate = await guardRoute('contributor');
  if (gate instanceof NextResponse) return gate;
  if (!storageConfigured()) {
    return NextResponse.json({ error: 'Storage not configured (SUPABASE_SERVICE_ROLE_KEY missing).' }, { status: 503 });
  }
  try {
    const { filename } = (await req.json()) as { filename?: unknown };
    if (typeof filename !== 'string' || !filename.trim()) {
      return NextResponse.json({ error: 'filename required' }, { status: 400 });
    }
    const { key, signedUrl } = await createSignedUpload(filename.trim());
    return NextResponse.json({ key, signedUrl });
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : 'failed' }, { status: 500 });
  }
}
