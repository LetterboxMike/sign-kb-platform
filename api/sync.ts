// Vercel Cron endpoint — incremental sync of the index from the deployed corpus.
// Validates + upserts changed records and re-embeds only changed chunks. `?rebuild=1`
// forces a full rebuild. Protect with CRON_SECRET (Bearer) so only the scheduler calls it.
//
// NOTE on records availability: this reads records/ , reference/ , canon/ from the
// DEPLOYMENT filesystem, so a Vercel cron only sees records present in the deployed commit.
// For a living local corpus, the post-batch hook (`npm run load`, run where records are
// authored) is the primary sync path; this cron is a periodic reconcile of deployed state.
import { load } from '../src/loader';
import { closePool } from '../src/db';

export default async function handler(req: any, res: any): Promise<void> {
  const secret = process.env.CRON_SECRET;
  if (secret) {
    const auth = req.headers?.authorization ?? req.headers?.Authorization;
    if (auth !== `Bearer ${secret}`) {
      res.status(401).json({ error: 'unauthorized' });
      return;
    }
  }
  try {
    const rebuild = req.query?.rebuild === '1' || req.query?.rebuild === 'true';
    const summary = await load({ rebuild });
    res.status(200).json({ ok: true, rebuild, summary });
  } catch (e: any) {
    res.status(500).json({ ok: false, error: e?.message ?? 'sync failed' });
  } finally {
    await closePool();
  }
}
