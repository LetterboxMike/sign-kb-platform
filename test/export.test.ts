import { describe, it, expect, afterAll } from 'vitest';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { exportCorpus } from '../src/export';
import { validateRecord } from '../src/validate';
import { query, closePool } from '../src/db';

// JSON export / round-trip. Skipped when DATABASE_URL is not set. Writes to a temp dir only;
// never touches the source records/ directory or the DB.
const hasDb = Boolean(process.env.DATABASE_URL);
const suite = hasDb ? describe : describe.skip;

suite('JSON export (portability layer)', () => {
  afterAll(async () => {
    await closePool();
  });

  it('exports the full live corpus as re-importable, schema-valid JSON', async () => {
    const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'signkb-export-'));
    const manifest = await exportCorpus({ outDir: tmp });

    const live = (
      await query<{ record_id: string }>("select record_id from signs where status='live' order by record_id")
    ).rows.map((r) => r.record_id);

    // Every live record is exported, and nothing extra.
    expect(manifest.count).toBe(live.length);
    expect(manifest.records.map((r) => r.record_id).sort()).toEqual([...live].sort());

    // Each per-record file exists and passes the schema gate — so a rebuild-from-export is accepted.
    for (const id of live) {
      const file = path.join(tmp, 'records', `${id}.json`);
      expect(fs.existsSync(file)).toBe(true);
      const raw = JSON.parse(fs.readFileSync(file, 'utf8'));
      expect(validateRecord(raw).valid).toBe(true);
    }

    // The full-corpus file holds the same set, and the manifest is versioned.
    const corpus = JSON.parse(fs.readFileSync(path.join(tmp, 'corpus.json'), 'utf8'));
    expect(corpus.length).toBe(live.length);
    expect(typeof manifest.exported_at).toBe('string');
    expect(manifest.embedding_model).toBeTruthy();

    fs.rmSync(tmp, { recursive: true, force: true });
  }, 120_000);
});
