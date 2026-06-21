import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { load } from '../src/loader';
import { runEval, passes } from '../src/eval';
import { closePool } from '../src/db';

// Retrieval regression gate. Needs DATABASE_URL + OPENAI_API_KEY (embeds each query).
const hasDeps = Boolean(process.env.DATABASE_URL && process.env.OPENAI_API_KEY);
const suite = hasDeps ? describe : describe.skip;

suite('Phase 5 retrieval eval (regression gate)', () => {
  beforeAll(async () => {
    await load({ rebuild: false, embed: true });
  }, 300_000);

  afterAll(async () => {
    await closePool();
  });

  it('meets the retrieval hit-rate thresholds', async () => {
    const rep = await runEval();
    const v = passes(rep.metrics);
    if (!v.ok) {
      console.error('eval failed:', v.reasons, rep.metrics);
      console.error('misses:', [...rep.recordResults, ...rep.canonResults].filter((r) => !(r.rank > 0 && r.rank <= 10)));
    }
    expect(v.ok).toBe(true);
    expect(rep.metrics.hit10).toBeGreaterThanOrEqual(Math.ceil(0.9 * rep.metrics.records));
    expect(rep.metrics.canonHit5).toBe(rep.metrics.canon);
  });
});
