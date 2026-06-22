import { NextResponse } from 'next/server';
import { runRegressionSuite } from '@/lib/kb';
import { guardRoute } from '@/lib/auth';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const maxDuration = 300;

// Scheduled + on-demand eval run (build-plan: "run on deploy and on schedule"). Runs the read-side
// regression suite — retrieval + chat grounding — read-only against the live corpus, and returns a
// pass/fail summary (HTTP 200 on pass, 503 on regression so a monitor/alert can catch it).
//
// Auth: a Vercel cron calls it with `Authorization: Bearer ${CRON_SECRET}`; an admin can also hit it
// in-browser (post-deploy smoke). Middleware lets the GET through (like the ingestion cron); auth is
// enforced here.
async function authorize(req: Request): Promise<NextResponse | null> {
  const secret = process.env.CRON_SECRET;
  if (secret && req.headers.get('authorization') === `Bearer ${secret}`) return null;
  const gate = await guardRoute('admin');
  return gate instanceof NextResponse ? gate : null;
}

export async function GET(req: Request) {
  const denied = await authorize(req);
  if (denied) return denied;
  try {
    const suite = await runRegressionSuite();
    return NextResponse.json(
      {
        ok: suite.ok,
        ran_at: new Date().toISOString(),
        reasons: suite.reasons,
        retrieval: suite.retrieval,
        chat: { ok: suite.chat.ok, reasons: suite.chat.reasons, metrics: suite.chat.metrics, failures: suite.chat.failures },
      },
      { status: suite.ok ? 200 : 503 },
    );
  } catch (e) {
    return NextResponse.json({ ok: false, error: e instanceof Error ? e.message : 'eval suite errored' }, { status: 500 });
  }
}
