import fs from 'node:fs';
import path from 'node:path';

type Json = any;

export type ChunkType = 'summary' | 'rationale' | 'design_obs' | 'principle' | 'exemplar';

export interface Chunk {
  source_id: string; // record_id, canon principle id, or synthesized exemplar id
  chunk_type: ChunkType;
  seq: number; // ordinal within (source_id, chunk_type); 0 when a single chunk
  text: string;
}

function clean(s: unknown): string | null {
  if (typeof s !== 'string') return null;
  const t = s.trim();
  return t.length ? t : null;
}

function slug(s: string): string {
  return s.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 80);
}

/** Chunks derived from a single sign record. Only present text fields produce chunks,
 *  so flat_graphic / vehicle_wrap (no `knowledge` block) yield only design_obs. */
export function mapRecordChunks(rec: Json): Chunk[] {
  const id: string = rec.record_id;
  const chunks: Chunk[] = [];
  const k = rec.knowledge ?? {};

  const summary = clean(k.plain_language_summary);
  if (summary) chunks.push({ source_id: id, chunk_type: 'summary', seq: 0, text: summary });

  const rationaleParts = [
    clean(k.rationale) && `Rationale: ${clean(k.rationale)}`,
    clean(k.tradeoffs) && `Tradeoffs: ${clean(k.tradeoffs)}`,
    clean(k.when_to_use) && `When to use: ${clean(k.when_to_use)}`,
  ].filter(Boolean) as string[];
  if (rationaleParts.length) {
    chunks.push({ source_id: id, chunk_type: 'rationale', seq: 0, text: rationaleParts.join('\n') });
  }

  const da = rec.design_assessment ?? {};
  const obs: string[] = [];
  for (const o of da.rules_observations ?? []) { const t = clean(o); if (t) obs.push(t); }
  for (const o of da.craft_observations ?? []) { const t = clean(o); if (t) obs.push(t); }
  for (const o of da.aesthetic_notes ?? []) { const t = clean(typeof o === 'string' ? o : o?.note); if (t) obs.push(t); }
  if (obs.length) chunks.push({ source_id: id, chunk_type: 'design_obs', seq: 0, text: obs.join('\n') });

  return chunks;
}

/** Chunks derived from one canon file's principles[] and exemplars[].
 *  Canon is NOT schema-gated and never lands in `signs`; it is only embedded into kb_chunks. */
export function mapCanonChunks(canon: Json): Chunk[] {
  const chunks: Chunk[] = [];

  for (const p of canon.principles ?? []) {
    const principle = clean(p.principle);
    if (!principle) continue;
    const parts = [principle, clean(p.rationale) && `Why: ${clean(p.rationale)}`].filter(Boolean) as string[];
    const appliesTo =
      Array.isArray(p.applies_to) && p.applies_to.length ? ` (applies to: ${p.applies_to.join(', ')})` : '';
    chunks.push({
      source_id: clean(p.id) ?? `principle-${slug(principle).slice(0, 40)}`,
      chunk_type: 'principle',
      seq: 0,
      text: parts.join('\n') + appliesTo,
    });
  }

  for (const e of canon.exemplars ?? []) {
    const name = clean(e.name);
    if (!name) continue;
    const meta = [clean(e.category), clean(e.award), e.year ? String(e.year) : null].filter(Boolean).join(' · ');
    const why = clean(e.why_it_won);
    const text = [name, meta || null, why && `Why it won: ${why}`].filter(Boolean).join('\n');
    chunks.push({ source_id: `exemplar-${slug(name)}`, chunk_type: 'exemplar', seq: 0, text });
  }

  return chunks;
}

/** Scan a canon directory for every *.json and flatten all canon chunks.
 *  Filename-agnostic so future canon files (e.g. graded exemplars) load with no code change. */
export function readCanonChunks(canonDir: string): Chunk[] {
  if (!fs.existsSync(canonDir)) return [];
  const files = fs.readdirSync(canonDir).filter((f) => f.endsWith('.json')).sort();
  const chunks: Chunk[] = [];
  for (const f of files) {
    const canon = JSON.parse(fs.readFileSync(path.join(canonDir, f), 'utf8'));
    chunks.push(...mapCanonChunks(canon));
  }
  return chunks;
}
