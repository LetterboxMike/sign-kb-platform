import { query, withTransaction } from './db';
import { requireOpenAIKey } from './config';

/**
 * Vendor/material ingestion + reference management. The reference layer (manufacturer/material
 * knowledge) is universal, join-resolved (not embedded, not schema-gated like sign records), so
 * this is a lighter ingestion: research a manufacturer/material, review the proposed entry, then
 * upsert it into `reference`. Mirrors the extraction skill's R4 ("research once per product").
 *
 * Note: like records, the DB is the system of record; app-added reference entries survive a plain
 * `load` (upsert-only) but should be exported before a full rebuild from files.
 */

const MODEL = process.env.REFERENCE_MODEL ?? process.env.CHAT_MODEL ?? 'gpt-5.4';

export interface ReferenceEntry {
  normalized_id: string;
  company: string | null;
  category: string | null;
  product: string | null;
  knowledge: string | null;
  optical_behavior: any;
  depth: string; // 'stub' | 'researched'
}

export interface ReferenceProposal {
  entry: ReferenceEntry;
  exists: boolean; // a row with this normalized_id already exists
  issues: string[]; // structural problems (empty = ok to approve)
}

function slug(s: string): string {
  return s.toLowerCase().trim().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 60);
}

export async function listReference(opts: { search?: string; limit?: number } = {}): Promise<ReferenceEntry[]> {
  const limit = opts.limit ?? 200;
  if (opts.search && opts.search.trim()) {
    const q = `%${opts.search.trim()}%`;
    const r = await query<ReferenceEntry>(
      `select normalized_id, company, category, product, knowledge, optical_behavior, depth
       from reference
       where company ilike $1 or product ilike $1 or normalized_id ilike $1 or category ilike $1
       order by normalized_id limit $2`,
      [q, limit],
    );
    return r.rows;
  }
  const r = await query<ReferenceEntry>(
    `select normalized_id, company, category, product, knowledge, optical_behavior, depth
     from reference order by normalized_id limit $1`,
    [limit],
  );
  return r.rows;
}

export async function getReferenceEntry(id: string): Promise<ReferenceEntry | null> {
  const r = await query<ReferenceEntry>(
    'select normalized_id, company, category, product, knowledge, optical_behavior, depth from reference where normalized_id = $1',
    [id],
  );
  return r.rows[0] ?? null;
}

function validateEntry(e: Partial<ReferenceEntry>): string[] {
  const issues: string[] = [];
  if (!e.normalized_id || !/^[a-z0-9][a-z0-9-]*$/.test(e.normalized_id)) issues.push('normalized_id must be a lowercase slug');
  if (!e.category) issues.push('category is required');
  if (!e.company && !e.product) issues.push('company or product is required');
  if (!e.knowledge) issues.push('knowledge (the value-add summary) is required');
  return issues;
}

/** Research a manufacturer/material into a proposed reference entry (model-assisted). */
export async function proposeReferenceEntry(input: { name: string; notes?: string }): Promise<ReferenceProposal> {
  const system = [
    'You research signage manufacturers, materials, and components into a normalized knowledge-base',
    'reference entry. Be concise and corpus-relevant (how it matters for sign fabrication / a mockup',
    'renderer) — NOT a catalog clone. Never invent specs you are unsure of.',
    '',
    'Produce ONE entry as JSON:',
    '{"normalized_id": "mfr-<slug> for a manufacturer, else a <slug>", "type": "manufacturer|material|component",',
    ' "company": "<manufacturer name or null>", "product": "<product/material name or null>",',
    ' "category": "<short category, e.g. acrylic, vinyl_film, led_module, aluminum, paint>",',
    ' "knowledge": "<1-3 sentences of corpus-relevant knowledge>",',
    ' "optical_behavior": <object describing light/finish behavior if relevant to rendering, else null>,',
    ' "depth": "researched"}',
  ].join('\n');
  const user = input.notes ? `${input.name}\n\nNotes: ${input.notes}` : input.name;

  const res = await fetch('https://api.openai.com/v1/chat/completions', {
    method: 'POST',
    headers: { Authorization: `Bearer ${requireOpenAIKey()}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      model: MODEL,
      messages: [
        { role: 'system', content: system },
        { role: 'user', content: user },
      ],
      response_format: { type: 'json_object' },
    }),
  });
  if (!res.ok) throw new Error(`OpenAI reference ${res.status}: ${await res.text()}`);
  const json = (await res.json()) as { choices?: { message?: { content?: string } }[] };
  let p: any = {};
  try {
    p = JSON.parse(json.choices?.[0]?.message?.content ?? '{}');
  } catch {
    p = {};
  }

  const isManufacturer = p.type === 'manufacturer';
  const entry: ReferenceEntry = {
    normalized_id: typeof p.normalized_id === 'string' && p.normalized_id ? slug(p.normalized_id) : slug((isManufacturer ? 'mfr-' : '') + (input.name || 'entry')),
    company: isManufacturer ? (p.company ?? input.name) : (p.company ?? null),
    product: isManufacturer ? (p.product ?? null) : (p.product ?? input.name),
    category: typeof p.category === 'string' ? p.category : null,
    knowledge: typeof p.knowledge === 'string' ? p.knowledge : null,
    optical_behavior: p.optical_behavior ?? null,
    depth: 'researched',
  };
  const existing = await getReferenceEntry(entry.normalized_id);
  return { entry, exists: Boolean(existing), issues: validateEntry(entry) };
}

/** Upsert a reviewed reference entry. Returns 'inserted' | 'updated'. */
export async function upsertReferenceEntry(entry: ReferenceEntry): Promise<'inserted' | 'updated'> {
  const issues = validateEntry(entry);
  if (issues.length) throw new Error(`invalid reference entry: ${issues.join('; ')}`);
  return withTransaction(async (c) => {
    const existing = await c.query('select 1 from reference where normalized_id = $1', [entry.normalized_id]);
    await c.query(
      `insert into reference (normalized_id, company, category, product, knowledge, optical_behavior, depth)
       values ($1,$2,$3,$4,$5,$6::jsonb,$7)
       on conflict (normalized_id) do update set
         company=excluded.company, category=excluded.category, product=excluded.product,
         knowledge=excluded.knowledge, optical_behavior=excluded.optical_behavior, depth=excluded.depth`,
      [
        entry.normalized_id,
        entry.company,
        entry.category,
        entry.product,
        entry.knowledge,
        entry.optical_behavior == null ? null : JSON.stringify(entry.optical_behavior),
        entry.depth || 'researched',
      ],
    );
    return existing.rows.length ? 'updated' : 'inserted';
  });
}
