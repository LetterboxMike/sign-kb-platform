import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { config } from '../src/config';
import { load } from '../src/loader';
import { search, filter, getRecord, resolveMaterial } from '../src/api';
import { query, closePool } from '../src/db';

const hasDb = Boolean(process.env.DATABASE_URL);
const hasKey = Boolean(process.env.OPENAI_API_KEY);
const suite = hasDb ? describe : describe.skip;
const readJson = (p: string) => JSON.parse(fs.readFileSync(p, 'utf8'));

suite('Phase 3 query API', () => {
  beforeAll(async () => {
    // Ensure the index reflects the corpus; embed too when a key is available (for search()).
    await load({ rebuild: false, embed: hasKey });
  }, 300_000);

  afterAll(async () => {
    await closePool();
  });

  describe('filter (pattern A)', () => {
    it('restricts to the requested category', async () => {
      const rows = await filter({ sign_category: 'monument' }, 1000);
      expect(rows.length).toBeGreaterThan(0);
      expect(rows.every((r) => r.sign_category === 'monument')).toBe(true);
      const count = await query<{ n: number }>(
        "select count(*)::int as n from signs where sign_category = 'monument'",
      );
      expect(rows.length).toBe(count.rows[0].n);
    });

    it('honours the limit and array criteria', async () => {
      const rows = await filter({ record_type: ['flat_graphic', 'vehicle_wrap'] }, 5);
      expect(rows.length).toBeLessThanOrEqual(5);
      expect(rows.every((r) => r.record_type === 'flat_graphic' || r.record_type === 'vehicle_wrap')).toBe(true);
    });

    it('supports material-category existence (the spec pattern-A example)', async () => {
      const rows = await filter({ sign_category: 'monument', material_category: 'structural_concrete_masonry' });
      const got = rows.map((r) => r.record_id).sort();
      const expected = (
        await query<{ record_id: string }>(
          `select s.record_id from signs s
           where s.sign_category = 'monument'
             and exists (select 1 from sign_materials m where m.record_id = s.record_id and m.category = 'structural_concrete_masonry')
           order by s.record_id`,
        )
      ).rows.map((r) => r.record_id);
      expect(got).toEqual(expected.sort());
      expect(got.length).toBeGreaterThan(0);
    });
  });

  describe('getRecord + resolveMaterial (pattern C)', () => {
    const id = 'rec-channel_letter-illuminated-storefront-001';

    it('returns the record with components and materials', async () => {
      const rec = readJson(path.join(config.recordsDir, `${id}.json`));
      const out = await getRecord(id);
      expect(out).not.toBeNull();
      expect(out!.record.record_id).toBe(id);
      expect(out!.components.length).toBe((rec.structure ?? []).length);
      expect(out!.materials.length).toBe((rec.materials_manifest ?? []).length);
      expect(out!.materials.every((m) => m.reference === null)).toBe(true); // no resolveRefs
    });

    it('resolves material references when asked (incl. reference knowledge)', async () => {
      const out = await getRecord(id, { resolveRefs: true });
      const threeM = out!.materials.find((m) => m.manufacturer_normalized_id === 'mfr-3m-graphics');
      expect(threeM).toBeTruthy();
      expect(threeM!.reference?.company).toBe('3M Commercial Graphics');
      expect(threeM!.reference?.knowledge).toBeTruthy();
    });

    it('returns null for an unknown record', async () => {
      expect(await getRecord('rec-does-not-exist-999')).toBeNull();
    });

    it('resolveMaterial returns the full reference entry', async () => {
      const ref = await resolveMaterial('mfr-3m-graphics');
      expect(ref?.company).toBe('3M Commercial Graphics');
      expect(ref?.knowledge).toBeTruthy();
      expect(await resolveMaterial('mfr-nope-000')).toBeNull();
    });
  });

  (hasKey ? describe : describe.skip)('search (hybrid B+A)', () => {
    it('ranks by similarity and returns the expected record', async () => {
      const hits = await search('internally illuminated storefront channel letters on a raceway', {}, 10);
      expect(hits.length).toBeGreaterThan(0);
      const d = hits.map((h) => h.distance);
      expect([...d].sort((a, b) => a - b)).toEqual(d); // ascending (nearest first)
      // The query is unambiguously about channel letters: the top results should be that category.
      expect(hits.slice(0, 5).some((h) => h.sign_category === 'channel_letter')).toBe(true);
      expect(hits.every((h) => h.raw && typeof h.raw === 'object')).toBe(true);
    });

    it('a filter restricts the candidate set before ranking', async () => {
      const hits = await search('board-formed concrete monument lit with a halo glow', { sign_category: 'monument' }, 10);
      expect(hits.length).toBeGreaterThan(0);
      expect(hits.every((h) => h.sign_category === 'monument')).toBe(true);
      expect(hits.map((h) => h.record_id)).toContain('rec-monument-boardformed-concrete-halo-001');
    });
  });
});
