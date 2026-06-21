import { config } from './config';
import { getPool } from './db';
import { embedTexts, toVectorLiteral } from './embed';

export interface Hit {
  source_id: string;
  source_kind: string;
  chunk_type: string;
  text: string;
  distance: number;
}

/** Phase 2 semantic retrieval helper: embed the query and rank kb_chunks by cosine distance.
 *  The full four-function query API (search/filter/getRecord/resolveMaterial) is Phase 3;
 *  this is the minimal pattern-B primitive it will build on. */
export async function semanticSearch(
  query: string,
  k = 12,
  opts: { chunkTypes?: string[]; sourceKinds?: string[] } = {},
): Promise<Hit[]> {
  const [emb] = await embedTexts([query]);
  const vec = toVectorLiteral(emb);
  const dim = config.embeddingDim;

  const where: string[] = [];
  const params: unknown[] = [vec, k];
  if (opts.chunkTypes?.length) {
    params.push(opts.chunkTypes);
    where.push(`chunk_type = any($${params.length})`);
  }
  if (opts.sourceKinds?.length) {
    params.push(opts.sourceKinds);
    where.push(`source_kind = any($${params.length})`);
  }
  const whereSql = where.length ? `where ${where.join(' and ')}` : '';

  const sql = `
    select source_id, source_kind, chunk_type, text,
           (embedding <=> $1::halfvec(${dim})) as distance
    from kb_chunks
    ${whereSql}
    order by embedding <=> $1::halfvec(${dim})
    limit $2`;
  const res = await getPool().query(sql, params);
  return res.rows.map((r) => ({ ...r, distance: Number(r.distance) })) as Hit[];
}
