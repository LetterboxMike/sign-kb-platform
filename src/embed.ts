import { config, requireOpenAIKey } from './config';

/** Embed a batch of texts with the configured OpenAI model. Returns vectors in input order.
 *  text-embedding-3-large returns its native 3072 dims (no `dimensions` param requested). */
export async function embedTexts(texts: string[]): Promise<number[][]> {
  if (texts.length === 0) return [];
  const key = requireOpenAIKey();
  const out: number[][] = [];
  const BATCH = 256;

  for (let i = 0; i < texts.length; i += BATCH) {
    const batch = texts.slice(i, i + BATCH);
    const res = await fetch('https://api.openai.com/v1/embeddings', {
      method: 'POST',
      headers: { Authorization: `Bearer ${key}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ model: config.embeddingModel, input: batch }),
    });
    if (!res.ok) {
      throw new Error(`OpenAI embeddings ${res.status}: ${await res.text()}`);
    }
    const json = (await res.json()) as { data: { index: number; embedding: number[] }[] };
    const sorted = [...json.data].sort((a, b) => a.index - b.index);
    for (const d of sorted) {
      if (d.embedding.length !== config.embeddingDim) {
        throw new Error(
          `embedding dim ${d.embedding.length} != configured ${config.embeddingDim} (model ${config.embeddingModel})`,
        );
      }
      out.push(d.embedding);
    }
  }
  return out;
}

/** pgvector literal for a halfvec/vector parameter, e.g. [0.1,0.2,...]. */
export function toVectorLiteral(v: number[]): string {
  return `[${v.join(',')}]`;
}
