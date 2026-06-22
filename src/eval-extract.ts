import fs from 'node:fs';
import path from 'node:path';
import { config } from './config';
import { extractFromFile } from './extract';

/**
 * Held-out extraction eval (build-plan eval #3 — the gate that matters most). Re-extracts a
 * held-out set of already-extracted drawings through the live pipeline and diffs field-level
 * against the known-good records, plus checks schema-validity and PII. This is the gate that
 * must pass before ingestion opens to contributors.
 *
 * The set is curated drawing -> known-good record_id pairs spanning the record types. Records
 * don't store their source filename (PII-stripped), so the mapping is maintained here.
 */

const ORIGINAL_DOCS = path.resolve(process.cwd(), 'Original Docs');

const PAIRS: { drawing: string; record_id: string }[] = [
  { drawing: 'Sebago Lake Overlook v1.pdf', record_id: 'rec-flat_graphic-dibond-interpretive-sebago-001' },
  { drawing: 'Kaiser.pdf', record_id: 'rec-directional-replacement-insert-panel-kaiser-001' },
  { drawing: 'Bow Street Beverage - Monument Sign v3.pdf', record_id: 'rec-monument-faux-material-changeable-bowstreet-001' },
  { drawing: '0005mr - JHU Bloomberg - banners - conceptual.pdf', record_id: 'rec-blade-column-clamp-perforated-panel-jhu-001' },
  { drawing: 'Pike County Detention Center - Van Wrap v1.pdf', record_id: 'rec-vehicle_wrap-fleet-van-pikecounty-001' },
  { drawing: 'Image National Design.PDF', record_id: 'rec-channel_letter-facelit-bank-imagenational-001' },
  { drawing: 'ARE Monument.pdf', record_id: 'rec-monument-msp-pushthru-tiered-are-001' },
];

// Pass thresholds — "comparable quality", not byte-identical (extraction is inherently fuzzy).
const THRESHOLDS = { recordTypeMatch: 1.0, classificationAccuracy: 0.7, schemaValidRate: 0.85, piiHits: 0 };

const readJson = (p: string) => JSON.parse(fs.readFileSync(p, 'utf8'));

function primaryCategory(rec: any): string | null {
  const c = rec?.classification ?? {};
  return c.sign_category ?? c.graphic_method ?? c.vehicle_class ?? null;
}

function materialCategories(rec: any): Set<string> {
  return new Set((rec?.materials_manifest ?? []).map((m: any) => m?.category).filter(Boolean));
}

/** Among candidate records, pick the one that best matches the known-good (type, then category). */
function bestMatch(candidates: any[], good: any): any | null {
  if (!candidates.length) return null;
  const sameType = candidates.filter((c) => c.record_type === good.record_type);
  const pool = sameType.length ? sameType : candidates;
  const cat = primaryCategory(good);
  return pool.find((c) => primaryCategory(c) === cat) ?? pool[0];
}

interface FieldCheck { field: string; expected: any; got: any; match: boolean; soft?: boolean }

function diffFields(cand: any, good: any): FieldCheck[] {
  const checks: FieldCheck[] = [];
  const add = (field: string, expected: any, got: any) => {
    if (expected === undefined || expected === null) return; // only score fields the known-good asserts
    checks.push({ field, expected, got: got ?? null, match: expected === got });
  };
  const gc = good.classification ?? {};
  const cc = cand?.classification ?? {};
  add('record_type', good.record_type, cand?.record_type);
  add('primary_category', primaryCategory(good), primaryCategory(cand));
  add('doc_type', good.source?.doc_type, cand?.source?.doc_type);
  if (good.record_type === 'fabricated_sign') {
    add('illuminated', gc.illuminated, cc.illuminated);
    add('illumination_method', gc.illumination_method, cc.illumination_method);
    add('fabrication_family', gc.fabrication_family, cc.fabrication_family);
    add('mounting', gc.mounting, cc.mounting);
  }
  // material categories — SOFT signal (taxonomy granularity legitimately differs); reported, not gated.
  const ge = materialCategories(good);
  if (ge.size) {
    const ce = materialCategories(cand);
    const inter = [...ge].filter((x) => ce.has(x)).length;
    const union = new Set([...ge, ...ce]).size;
    checks.push({ field: 'material_categories', expected: [...ge], got: [...ce], match: union > 0 && inter / union >= 0.5, soft: true });
  }
  return checks;
}

async function main() {
  const results: {
    drawing: string;
    record_id: string;
    candidateCount: number;
    matched: boolean;
    schemaValid: boolean;
    pii: string[];
    checks: FieldCheck[];
    accuracy: number;
  }[] = [];

  for (const { drawing, record_id } of PAIRS) {
    const drawingPath = path.join(ORIGINAL_DOCS, drawing);
    const good = readJson(path.join(config.recordsDir, `${record_id}.json`));
    process.stdout.write(`Extracting "${drawing}" … `);
    const { candidates } = await extractFromFile(drawingPath);
    const best = bestMatch(candidates.map((c) => c.record), good);
    const bestCand = candidates.find((c) => c.record === best);
    const checks = best ? diffFields(best, good) : [];
    const core = checks.filter((c) => !c.soft); // record_type + classification fields — the gate
    const matched = core.filter((c) => c.match).length;
    const accuracy = core.length ? matched / core.length : 0;
    const pii = bestCand ? bestCand.flags.filter((f) => f.toLowerCase().includes('email') || f.toLowerCase().includes('phone')) : [];
    results.push({
      drawing,
      record_id,
      candidateCount: candidates.length,
      matched: Boolean(best),
      schemaValid: bestCand?.valid ?? false,
      pii,
      checks,
      accuracy,
    });
    console.log(`${candidates.length} candidate(s), ${(accuracy * 100).toFixed(0)}% field match, schema ${bestCand?.valid ? 'valid' : 'INVALID'}`);
  }

  // Aggregate.
  const n = results.length;
  const recordTypeMatch = results.filter((r) => r.checks.find((c) => c.field === 'record_type')?.match).length / n;
  const classificationAccuracy = results.reduce((s, r) => s + r.accuracy, 0) / n;
  const schemaValidRate = results.filter((r) => r.schemaValid).length / n;
  const piiHits = results.reduce((s, r) => s + r.pii.length, 0);
  const matOverlap =
    results.reduce((s, r) => {
      const soft = r.checks.filter((c) => c.soft);
      return s + (soft.length ? soft.filter((c) => c.match).length / soft.length : 0);
    }, 0) / n;

  console.log('\n— Held-out extraction eval —');
  console.log(`  drawings              : ${n}`);
  console.log(`  record_type match     : ${(recordTypeMatch * 100).toFixed(0)}%  (threshold ${THRESHOLDS.recordTypeMatch * 100}%)`);
  console.log(`  classification acc.   : ${(classificationAccuracy * 100).toFixed(0)}%  (threshold ${THRESHOLDS.classificationAccuracy * 100}%)  [core fields only]`);
  console.log(`  schema-valid rate     : ${(schemaValidRate * 100).toFixed(0)}%  (threshold ${THRESHOLDS.schemaValidRate * 100}%)`);
  console.log(`  PII hits              : ${piiHits}  (threshold ${THRESHOLDS.piiHits})`);
  console.log(`  materials overlap     : ${(matOverlap * 100).toFixed(0)}%  (soft signal — not gated)`);

  console.log('\n  Per-drawing field diff:');
  for (const r of results) {
    console.log(`  • ${r.drawing}  →  ${(r.accuracy * 100).toFixed(0)}%  (${r.candidateCount} cand, schema ${r.schemaValid ? 'ok' : 'INVALID'})`);
    for (const c of r.checks) {
      if (!c.match) console.log(`      ✗ ${c.field}: expected ${JSON.stringify(c.expected)} got ${JSON.stringify(c.got)}`);
    }
    for (const p of r.pii) console.log(`      ⚠ ${p}`);
  }

  const pass =
    recordTypeMatch >= THRESHOLDS.recordTypeMatch &&
    classificationAccuracy >= THRESHOLDS.classificationAccuracy &&
    schemaValidRate >= THRESHOLDS.schemaValidRate &&
    piiHits <= THRESHOLDS.piiHits;
  console.log(pass ? '\nPASS — extraction quality meets the held-out thresholds' : '\nFAIL — below threshold (tune prompt or keep review gate tight before opening ingestion)');
  process.exit(pass ? 0 : 1);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
