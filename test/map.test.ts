import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { config } from '../src/config';
import {
  contentHash,
  mapSignRow,
  mapComponents,
  mapMaterials,
  mapReferenceEntries,
} from '../src/map';

const readJson = (p: string) => JSON.parse(fs.readFileSync(p, 'utf8'));

describe('mapping', () => {
  const rec = readJson(
    path.join(config.recordsDir, 'rec-channel_letter-illuminated-storefront-001.json'),
  );

  it('content_hash is stable and key-order independent', () => {
    const h1 = contentHash(rec);
    const reordered = JSON.parse(JSON.stringify(rec));
    const rebuilt: any = {};
    for (const k of Object.keys(reordered).reverse()) rebuilt[k] = reordered[k];
    expect(contentHash(rebuilt)).toBe(h1);
  });

  it('promotes classification + source + dimensions into signs columns', () => {
    const row = mapSignRow(rec);
    expect(row.record_id).toBe('rec-channel_letter-illuminated-storefront-001');
    expect(row.record_type).toBe('fabricated_sign');
    expect(row.sign_category).toBe('channel_letter');
    expect(row.fabrication_family).toBe('channel_letter');
    expect(row.illumination_method).toBe('internal_led');
    expect(row.illuminated).toBe(true);
    expect(row.mounting).toBe('wall_mounted');
    expect(row.doc_type).toBe('shop');
    expect(row.width_in).toBe(136);
    expect(row.height_in).toBe(51.5);
    expect(row.raw).toBe(rec);
  });

  it('flat_graphic records leave fabricated-only columns null', () => {
    const fg = readJson(path.join(config.recordsDir, 'rec-flat_graphic-vinyl-on-glass-001.json'));
    const row = mapSignRow(fg);
    expect(row.record_type).toBe('flat_graphic');
    expect(row.sign_category).toBeNull();
    expect(row.illumination_method).toBeNull();
  });

  it('maps structure -> components and materials_manifest -> materials', () => {
    expect(mapComponents(rec).length).toBe((rec.structure ?? []).length);
    expect(mapMaterials(rec).length).toBe((rec.materials_manifest ?? []).length);
  });

  it('maps reference entries: manufacturer -> company, component -> product', () => {
    const rows = mapReferenceEntries(readJson(config.referenceFile));
    const mfr = rows.find((r) => r.normalized_id === 'mfr-3m-graphics');
    const comp = rows.find((r) => r.normalized_id === 'comp-signcomp-1927');
    expect(mfr?.company).toBeTruthy();
    expect(mfr?.product).toBeNull();
    expect(comp?.product).toBeTruthy();
    expect(comp?.company).toBeNull();
  });
});
