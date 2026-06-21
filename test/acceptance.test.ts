import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { config } from '../src/config';
import { load, type LoadSummary } from '../src/loader';
import { query, closePool } from '../src/db';

// DB-backed acceptance checks. Skipped automatically when DATABASE_URL is not set.
const hasDb = Boolean(process.env.DATABASE_URL);
const suite = hasDb ? describe : describe.skip;
const readJson = (p: string) => JSON.parse(fs.readFileSync(p, 'utf8'));

suite('Phase 1 acceptance (DB-backed)', () => {
  let initial: LoadSummary;

  beforeAll(async () => {
    initial = await load({ rebuild: true, embed: false });
  }, 180_000);

  afterAll(async () => {
    await closePool();
  });

  it('count(signs) equals the number of valid records', async () => {
    const r = await query<{ n: number }>('select count(*)::int as n from signs');
    expect(r.rows[0].n).toBe(initial.validRecords);
    expect(initial.rejected).toEqual([]); // the corpus is clean
  });

  it('reference rows are loaded', async () => {
    const r = await query<{ n: number }>('select count(*)::int as n from reference');
    expect(r.rows[0].n).toBe(initial.referenceRows);
  });

  it('re-running with no changes updates zero rows (idempotent)', async () => {
    const again = await load({ rebuild: false, embed: false });
    expect(again.inserted).toBe(0);
    expect(again.updated).toBe(0);
    expect(again.deleted).toBe(0);
    expect(again.unchanged).toBe(initial.validRecords);
  });

  it('pattern A: halo-lit monuments with a concrete/masonry base (index matches corpus)', async () => {
    // Derive the expected set from the source-of-truth files so the test holds as the
    // living corpus grows — this asserts the projection equals the source for this predicate.
    const expected = fs
      .readdirSync(config.recordsDir)
      .filter((f) => f.endsWith('.json'))
      .map((f) => readJson(path.join(config.recordsDir, f)))
      .filter(
        (d) =>
          d?.classification?.sign_category === 'monument' &&
          d?.classification?.illumination_method === 'halo_illuminated' &&
          (d?.materials_manifest ?? []).some((m: any) => m?.category === 'structural_concrete_masonry'),
      )
      .map((d) => d.record_id)
      .sort();

    const r = await query<{ record_id: string }>(
      `select s.record_id from signs s
       where s.sign_category = 'monument' and s.illumination_method = 'halo_illuminated'
         and exists (select 1 from sign_materials m
                     where m.record_id = s.record_id and m.category = 'structural_concrete_masonry')
       order by s.record_id`,
    );
    expect(r.rows.map((x) => x.record_id)).toEqual(expected);
    expect(expected.length).toBeGreaterThan(0); // the predicate actually matches something
  });

  it('components and materials join back to their parent record', async () => {
    const id = 'rec-channel_letter-illuminated-storefront-001';
    const rec = readJson(path.join(config.recordsDir, `${id}.json`));

    const comps = await query<{ n: number }>(
      `select count(*)::int as n from sign_components c
       join signs s on s.record_id = c.record_id where s.record_id = $1`,
      [id],
    );
    const mats = await query<{ n: number }>(
      `select count(*)::int as n from sign_materials m
       join signs s on s.record_id = m.record_id where s.record_id = $1`,
      [id],
    );
    expect(comps.rows[0].n).toBe((rec.structure ?? []).length);
    expect(mats.rows[0].n).toBe((rec.materials_manifest ?? []).length);
  });

  it('the gate keeps an invalid record out of the index', async () => {
    // Build a throwaway corpus: one real valid record + one deliberately invalid record.
    const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'signkb-gate-'));
    const valid = readJson(path.join(config.recordsDir, 'rec-flat_graphic-vinyl-on-glass-001.json'));
    fs.writeFileSync(path.join(tmp, 'valid.json'), JSON.stringify(valid));
    fs.writeFileSync(
      path.join(tmp, 'invalid.json'),
      JSON.stringify({ record_id: 'rec-should-not-load-001', schema_version: '1.4', source: { doc_type: 'shop' } }),
    );

    const s = await load({ rebuild: true, embed: false, recordsDir: tmp, referenceFile: config.referenceFile });
    expect(s.validRecords).toBe(1);
    expect(s.rejected.length).toBe(1);

    const present = await query<{ n: number }>(
      "select count(*)::int as n from signs where record_id = 'rec-should-not-load-001'",
    );
    expect(present.rows[0].n).toBe(0);

    fs.rmSync(tmp, { recursive: true, force: true });
    // Restore the full corpus so the project is left in the loaded state.
    await load({ rebuild: true, embed: false });
  }, 180_000);
});
