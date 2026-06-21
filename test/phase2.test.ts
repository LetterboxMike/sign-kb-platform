import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { config } from '../src/config';
import { load } from '../src/loader';
import { validateRecord } from '../src/validate';
import { mapRecordChunks, readCanonChunks } from '../src/chunk';
import { semanticSearch } from '../src/retrieve';
import { query, closePool } from '../src/db';

// DB + OpenAI backed. Skipped unless both DATABASE_URL and OPENAI_API_KEY are set.
const hasDeps = Boolean(process.env.DATABASE_URL && process.env.OPENAI_API_KEY);
const suite = hasDeps ? describe : describe.skip;
const readJson = (p: string) => JSON.parse(fs.readFileSync(p, 'utf8'));

function expectedChunkCount(): { total: number; canon: number } {
  const recordFiles = fs.readdirSync(config.recordsDir).filter((f) => f.endsWith('.json'));
  let record = 0;
  for (const f of recordFiles) {
    const rec = readJson(path.join(config.recordsDir, f));
    if (validateRecord(rec).valid) record += mapRecordChunks(rec).length;
  }
  const canon = readCanonChunks(config.canonDir).length;
  return { total: record + canon, canon };
}

suite('Phase 2 acceptance (embeddings / semantic retrieval)', () => {
  beforeAll(async () => {
    // Incremental: embeds anything missing/changed, no-ops when already current.
    await load({ rebuild: false, embed: true });
  }, 300_000);

  afterAll(async () => {
    await closePool();
  });

  it('every record + canon chunk is embedded (kb_chunks matches the corpus)', async () => {
    const exp = expectedChunkCount();
    const total = await query<{ n: number }>('select count(*)::int as n from kb_chunks');
    const nullEmb = await query<{ n: number }>('select count(*)::int as n from kb_chunks where embedding is null');
    const canon = await query<{ n: number }>("select count(*)::int as n from kb_chunks where source_kind = 'canon'");
    const model = await query<{ m: string }>('select distinct embedding_model as m from kb_chunks');

    expect(total.rows[0].n).toBe(exp.total);
    expect(nullEmb.rows[0].n).toBe(0);
    expect(canon.rows[0].n).toBe(exp.canon);
    expect(model.rows.map((r) => r.m)).toEqual([config.embeddingModel]);
  });

  it('canon principles and exemplars are retrievable as their own chunk types', async () => {
    const types = await query<{ t: string }>('select distinct chunk_type as t from kb_chunks order by chunk_type');
    const set = new Set(types.rows.map((r) => r.t));
    for (const t of ['summary', 'rationale', 'design_obs', 'principle', 'exemplar']) expect(set.has(t)).toBe(true);
  });

  it('a natural-language query retrieves the relevant record in the top results', async () => {
    // Distinctive record: board-formed concrete monument with halo illumination.
    const target = 'rec-monument-boardformed-concrete-halo-001';
    const hits = await semanticSearch(
      'board-formed concrete monument sign lit with a halo glow',
      10,
      { sourceKinds: ['record'] },
    );
    const ids = hits.map((h) => h.source_id);
    expect(ids).toContain(target);
    // distances are sorted ascending (nearest first)
    const d = hits.map((h) => h.distance);
    expect([...d].sort((a, b) => a - b)).toEqual(d);
  });

  it('a design-principle query retrieves a canon principle', async () => {
    const hits = await semanticSearch(
      'the message must be legible at the intended distance and approach speed',
      10,
      { chunkTypes: ['principle'] },
    );
    expect(hits.length).toBeGreaterThan(0);
    expect(hits[0].source_kind).toBe('canon');
    expect(hits.map((h) => h.source_id)).toContain('leg-01');
  });

  it('re-running embeds nothing when nothing changed (idempotent)', async () => {
    const again = await load({ rebuild: false, embed: true });
    expect(again.chunksEmbedded).toBe(0);
    expect(again.chunksDeleted).toBe(0);
  });

  it('a changed chunk is re-embedded, and only that chunk', async () => {
    // Simulate a source change by staling one chunk's hash; the loader must re-embed exactly it.
    const target = await query<{ source_id: string; chunk_type: string; seq: number; content_hash: string }>(
      "select source_id, chunk_type, seq, content_hash from kb_chunks where source_id = 'leg-01' and chunk_type = 'principle' limit 1",
    );
    expect(target.rows.length).toBe(1);
    const row = target.rows[0];

    await query(
      'update kb_chunks set content_hash = $1 where source_id = $2 and chunk_type = $3 and seq = $4',
      ['STALE', row.source_id, row.chunk_type, row.seq],
    );

    const s = await load({ rebuild: false, embed: true });
    expect(s.chunksEmbedded).toBe(1);

    const after = await query<{ content_hash: string; has_emb: boolean }>(
      'select content_hash, (embedding is not null) as has_emb from kb_chunks where source_id = $1 and chunk_type = $2 and seq = $3',
      [row.source_id, row.chunk_type, row.seq],
    );
    expect(after.rows[0].content_hash).toBe(row.content_hash); // restored to the correct hash
    expect(after.rows[0].has_emb).toBe(true);
  });
});
