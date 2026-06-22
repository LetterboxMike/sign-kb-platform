import { NextResponse } from 'next/server';
import { buildExportBundle } from '@/lib/kb';
import { guardRoute } from '@/lib/auth';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const maxDuration = 120;

// Download the KB as one JSON bundle (records + reference layer + manifest). The portability
// layer, served as a file download (no filesystem write, so it works on serverless). Admin-only —
// it exposes the full corpus, including staging/rejected when ?all=1.
export async function GET(req: Request) {
  const gate = await guardRoute('admin');
  if (gate instanceof NextResponse) return gate;
  const all = new URL(req.url).searchParams.get('all') === '1';
  const bundle = await buildExportBundle({ includeNonLive: all });
  const date = bundle.manifest.exported_at.slice(0, 10);
  return new NextResponse(JSON.stringify(bundle, null, 2), {
    headers: {
      'content-type': 'application/json',
      'content-disposition': `attachment; filename="sign-kb-export-${date}${all ? '-all' : ''}.json"`,
    },
  });
}
