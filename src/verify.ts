import path from 'node:path';
import { config } from './config';
import { query, closePool } from './db';

export interface Invariant {
  name: string;
  ok: boolean;
  detail: string;
}

/**
 * Standing post-load integrity tripwires — the exact conditions a derived projection must
 * never violate. Cheap SELECTs; run after every load and as `npm run verify:index`.
 */
export async function checkInvariants(): Promise<Invariant[]> {
  const out: Invariant[] = [];
  const check = async (name: string, sql: string, fmt: (n: number) => string) => {
    const r = await query<{ n: number }>(sql);
    const n = Number(r.rows[0].n);
    out.push({ name, ok: n === 0, detail: fmt(n) });
  };

  await check('no null embeddings', 'select count(*)::int n from kb_chunks where embedding is null', (n) => `${n} null`);
  await check(
    `all embeddings are ${config.embeddingDim}-dim`,
    `select count(*)::int n from kb_chunks where embedding is not null and vector_dims(embedding::vector(${config.embeddingDim})) <> ${config.embeddingDim}`,
    (n) => `${n} wrong-dim`,
  );
  await check(
    'single embedding model',
    `select greatest(count(distinct embedding_model)::int - 1, 0) n from kb_chunks where embedding is not null`,
    (n) => `${n} model(s) beyond the first`,
  );
  await check(
    'unique chunk keys',
    'select count(*)::int n from (select 1 from kb_chunks group by source_id, chunk_type, seq having count(*) > 1) t',
    (n) => `${n} duplicate (source_id, chunk_type, seq)`,
  );
  await check(
    'no orphan record chunks',
    "select count(*)::int n from kb_chunks c where c.source_kind = 'record' and not exists (select 1 from signs s where s.record_id = c.source_id)",
    (n) => `${n} record chunks with no parent sign`,
  );
  await check(
    'no orphan components',
    'select count(*)::int n from sign_components c left join signs s on s.record_id = c.record_id where s.record_id is null',
    (n) => `${n} orphan components`,
  );
  await check(
    'no orphan materials',
    'select count(*)::int n from sign_materials m left join signs s on s.record_id = m.record_id where s.record_id is null',
    (n) => `${n} orphan materials`,
  );
  await check(
    'no dangling material FKs',
    'select count(*)::int n from sign_materials m where m.manufacturer_normalized_id is not null and not exists (select 1 from reference r where r.normalized_id = m.manufacturer_normalized_id)',
    (n) => `${n} dangling manufacturer_normalized_id`,
  );

  return out;
}

const invokedDirectly = process.argv[1] && import.meta.url.endsWith(path.basename(process.argv[1]));
if (invokedDirectly) {
  checkInvariants()
    .then((inv) => {
      console.log('\nIndex invariants:');
      for (const i of inv) console.log(`  ${i.ok ? 'OK  ' : 'FAIL'}  ${i.name} — ${i.detail}`);
      const failed = inv.filter((i) => !i.ok);
      console.log(failed.length ? `\n${failed.length} invariant(s) VIOLATED.` : '\nAll invariants hold.');
      return closePool().then(() => process.exit(failed.length ? 1 : 0));
    })
    .catch(async (e) => {
      console.error(e);
      await closePool();
      process.exit(1);
    });
}
