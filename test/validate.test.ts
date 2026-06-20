import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { config } from '../src/config';
import { validateRecord } from '../src/validate';

const root = process.cwd();
const readJson = (p: string) => JSON.parse(fs.readFileSync(p, 'utf8'));

describe('validation gate (Ajv against sign-record.schema.json)', () => {
  it('accepts a real record from the corpus', () => {
    const sample = readJson(
      path.join(config.recordsDir, 'rec-channel_letter-illuminated-storefront-001.json'),
    );
    expect(validateRecord(sample).valid).toBe(true);
  });

  it('rejects a record missing the required record_type', () => {
    const bad = readJson(path.join(root, 'test/fixtures/invalid/missing-record-type.json'));
    const res = validateRecord(bad);
    expect(res.valid).toBe(false);
    expect(res.errors.length).toBeGreaterThan(0);
  });

  it('rejects a record with an out-of-enum sign_category', () => {
    const bad = readJson(path.join(root, 'test/fixtures/invalid/bad-enum.json'));
    expect(validateRecord(bad).valid).toBe(false);
  });

  it('every record in records/ is valid (the corpus is clean)', () => {
    const files = fs.readdirSync(config.recordsDir).filter((f) => f.endsWith('.json'));
    const failures = files.filter((f) => !validateRecord(readJson(path.join(config.recordsDir, f))).valid);
    expect(failures).toEqual([]);
  });
});
