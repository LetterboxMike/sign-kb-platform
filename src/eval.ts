import { search } from './api';
import { semanticSearch } from './retrieve';
import { closePool } from './db';

/**
 * Retrieval regression gate. A fixed set of natural-language queries with the record (or canon
 * principle) each should retrieve, run against the query API. Re-run on any change to the
 * embedding model, chunking rules, or retrieval logic to catch quality regressions.
 *
 * Queries are deliberate paraphrases — never verbatim text from the records — so this tests
 * semantic retrieval, not lexical match.
 */
export interface EvalCase {
  query: string;
  expected: string;
}

export const RECORD_CASES: EvalCase[] = [
  { query: 'a cloth canopy over a storefront whose underside glows at night', expected: 'rec-awning-illuminated-soffit-zos-001' },
  { query: 'a sign sticking out perpendicular from the wall so people walking down a hallway can spot it from the side', expected: 'rec-blade-acrylic-flag-corridor-asi105-001' },
  { query: 'branding treatments for cash machines including drive-up units with a lit overhead canopy', expected: 'rec-atm-kiosk-freestanding-unitedbank-001' },
  { query: 'the standard kit of front-glowing dimensional letters in different sizes and the two corporate colors', expected: 'rec-channel_letter-brand-family-facelit-001' },
  { query: 'an electronic changeable message screen for a college mounted on a brick and stone base', expected: 'rec-digital_display-campus-emc-deltacollege-001' },
  { query: 'arrow signs on posts that point visitors where to go, available in several sizes with swappable panels', expected: 'rec-directional-brand-family-postpanel-001' },
  { query: 'a dark steel wall panel built to hold a commemorative shovel from a groundbreaking ceremony', expected: 'rec-feature-display-steel-artifact-mount-001' },
  { query: 'covering an old concrete ground sign with a fresh metal face instead of tearing down the masonry', expected: 'rec-monument-aluminum-reskin-existing-001' },
  { query: 'a tall two-sided roadside pole sign with lit push-through lettering, offered in multiple heights', expected: 'rec-pylon-brand-family-clad-steel-001' },
  { query: 'a board-formed concrete monument with halo-lit lettering', expected: 'rec-monument-boardformed-concrete-halo-001' },
  { query: 'a printed graphic covering an entire interior wall floor to ceiling', expected: 'rec-flat_graphic-full-coverage-wall-mural-001' },
  { query: 'a tactile room-identification sign with braille in two languages meeting California accessibility code', expected: 'rec-plaque-ada-tactile-bilingual-title24-001' },
  { query: 'a lit storefront sign combining a pictorial logo cloud, channel-letter wordmark, and a small descriptor cloud with dual-color film on a painted raceway', expected: 'rec-channel_letter-illuminated-storefront-001' },
];

export const CANON_CASES: EvalCase[] = [
  { query: 'the message has to be readable from how far away and how fast people are moving before you worry about looks', expected: 'leg-01' },
  { query: 'in wayfinding give people exactly the right amount of information at each decision point, no more no less', expected: 'sys-02' },
];

export interface EvalResult {
  kind: 'record' | 'canon';
  query: string;
  expected: string;
  rank: number; // 1-based; 0 = not in top-k
  top5: string[];
}

export interface EvalReport {
  recordResults: EvalResult[];
  canonResults: EvalResult[];
  metrics: { records: number; hit1: number; hit5: number; hit10: number; canon: number; canonHit5: number };
}

// Thresholds — the gate. Tuned to the observed corpus with margin for live growth.
export const THRESHOLDS = { hit5Frac: 0.7, hit10Frac: 0.9 };

export function passes(m: EvalReport['metrics']): { ok: boolean; reasons: string[] } {
  const reasons: string[] = [];
  if (m.hit10 < Math.ceil(THRESHOLDS.hit10Frac * m.records)) reasons.push(`hit@10 ${m.hit10}/${m.records} < ${Math.ceil(THRESHOLDS.hit10Frac * m.records)}`);
  if (m.hit5 < Math.ceil(THRESHOLDS.hit5Frac * m.records)) reasons.push(`hit@5 ${m.hit5}/${m.records} < ${Math.ceil(THRESHOLDS.hit5Frac * m.records)}`);
  if (m.canonHit5 < m.canon) reasons.push(`canon hit@5 ${m.canonHit5}/${m.canon} < ${m.canon}`);
  return { ok: reasons.length === 0, reasons };
}

export async function runEval(k = 10): Promise<EvalReport> {
  const recordResults: EvalResult[] = [];
  for (const c of RECORD_CASES) {
    const hits = await search(c.query, {}, k);
    const ids = hits.map((h) => h.record_id);
    const idx = ids.indexOf(c.expected);
    recordResults.push({ kind: 'record', query: c.query, expected: c.expected, rank: idx + 1, top5: ids.slice(0, 5) });
  }
  const canonResults: EvalResult[] = [];
  for (const c of CANON_CASES) {
    const hits = await semanticSearch(c.query, 5, { chunkTypes: ['principle'] });
    const ids = hits.map((h) => h.source_id);
    const idx = ids.indexOf(c.expected);
    canonResults.push({ kind: 'canon', query: c.query, expected: c.expected, rank: idx + 1, top5: ids.slice(0, 5) });
  }
  const recHitAt = (n: number) => recordResults.filter((r) => r.rank > 0 && r.rank <= n).length;
  return {
    recordResults,
    canonResults,
    metrics: {
      records: recordResults.length,
      hit1: recHitAt(1),
      hit5: recHitAt(5),
      hit10: recHitAt(10),
      canon: canonResults.length,
      canonHit5: canonResults.filter((r) => r.rank > 0 && r.rank <= 5).length,
    },
  };
}

const invokedDirectly = process.argv[1] && process.argv[1].endsWith('eval.ts');
if (invokedDirectly) {
  runEval()
    .then((rep) => {
      console.log('\nRetrieval eval — records (rank of expected, top-10):');
      for (const r of rep.recordResults) {
        console.log(`  ${r.rank ? `#${r.rank}`.padEnd(4) : 'MISS'} ${r.expected}`);
      }
      console.log('\nRetrieval eval — canon principles (rank, top-5):');
      for (const r of rep.canonResults) console.log(`  ${r.rank ? `#${r.rank}`.padEnd(4) : 'MISS'} ${r.expected}`);
      const m = rep.metrics;
      console.log(`\nrecords: hit@1 ${m.hit1}/${m.records}  hit@5 ${m.hit5}/${m.records}  hit@10 ${m.hit10}/${m.records}`);
      console.log(`canon:   hit@5 ${m.canonHit5}/${m.canon}`);
      const v = passes(m);
      console.log(v.ok ? '\nEVAL PASS' : `\nEVAL FAIL: ${v.reasons.join('; ')}`);
      return closePool().then(() => process.exit(v.ok ? 0 : 1));
    })
    .catch(async (e) => {
      console.error(e);
      await closePool();
      process.exit(1);
    });
}
