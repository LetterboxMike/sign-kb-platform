# Serving Surface — Spec

The derived, rebuildable read index that turns the source-of-truth sign records into the three access patterns the view consumers query. The versioned JSON records stay the source of truth. This is a projection of them, and it can be dropped and rebuilt from the records at any time.

Consumers query this surface through one API. They never touch the raw files and never touch each other.

---

## Where it lives (the stack call)

**The index is Supabase (Postgres + pgvector). Not Convex.** Convex is the right tool for reactive app state, but the KB serving layer is a read-heavy derived corpus that needs three things in one engine: relational filtering, vector similarity, and joins for reference resolution. Postgres with pgvector does all three natively in a single query. Splitting them across engines would mean stitching vector hits back to relational filters in app code, which is exactly the seam to avoid.

```
SOURCE OF TRUTH            SERVING SURFACE (Supabase)         CONSUMERS
records/  *.json   --->    Postgres tables + pgvector   --->  Agent / Designer / portal
reference/ *.json          (rebuildable projection)           (call the query API, never SQL)
canon/                          ^
        \____ sync job (Vercel cron / post-batch) ____/
```

Source JSON lives in the repo. A sync job rebuilds or incrementally updates the index. Apps (Nuxt/Convex) call a thin query API. Convex stays the app-reactive layer and calls that API for KB reads.

---

## Tables (DDL sketch)

```sql
-- one row per record; structured fields promoted for filtering, full record kept in raw
create table signs (
  record_id        text primary key,
  record_type      text not null,         -- fabricated_sign | flat_graphic | vehicle_wrap
  sign_category    text, sub_type text, fabrication_family text,
  illumination_method text, illuminated boolean, mounting text,
  sides int, digital_integration boolean,
  doc_type         text, industry_vertical text,
  design_status    text, option_set_id text, quality_grade text,
  width_in numeric, height_in numeric, area_sqft numeric,
  ada_tactile boolean, ada_braille boolean, title_24 boolean,
  is_program boolean,
  raw              jsonb not null,         -- the full record; anything not promoted stays queryable
  content_hash     text not null,          -- for incremental sync
  schema_version   text
);

create table sign_components (
  id bigserial primary key,
  record_id text references signs(record_id) on delete cascade,
  component text, fabrication_method text, illumination text,
  material_refs text[], mounted_to text
);

create table sign_materials (
  id bigserial primary key,
  record_id text references signs(record_id) on delete cascade,
  material_ref text, category text, product text, application text,
  manufacturer_normalized_id text references reference(normalized_id)
);

-- the manufacturer/material reference table (its own source-of-truth file)
create table reference (
  normalized_id text primary key,
  company text, category text, product text,
  knowledge text, optical_behavior jsonb, depth text   -- stub | researched
);

-- what semantic search runs over: sign knowledge chunks AND design-canon chunks, together
create table kb_chunks (
  id bigserial primary key,
  source_id text,                          -- record_id or canon principle/exemplar id
  chunk_type text,                         -- summary | rationale | design_obs | principle | exemplar
  text text not null,
  embedding vector(1536)                   -- dimension matches the chosen model
);
```

Promote to a column only the fields consumers filter on. Everything else stays in `raw` (jsonb), reachable with `raw -> 'path'` and a GIN index, so the surface never blocks on a field we didn't think to promote.

---

## The three access patterns

**A. Structured filter** — exact, faceted SQL over `signs` plus joins. Used by the pricing engine, Sign Spotter's taxonomy, and any faceted browse.
```sql
-- halo-lit monuments with a concrete/masonry base
select s.* from signs s
where s.sign_category = 'monument' and s.illumination_method = 'halo_illuminated'
and exists (select 1 from sign_materials m
            where m.record_id = s.record_id and m.category = 'structural_concrete_masonry');
```

**B. Semantic retrieval** — pgvector similarity over `kb_chunks`. Used by the Substrate Agent, the Tradecraft portal, and the Designer.
```sql
-- nearest knowledge to an embedded query
select source_id, chunk_type, text
from kb_chunks order by embedding <=> $query_embedding limit 12;
```

**C. Reference resolution** — join a record's materials to their reference entries, returning full spec and `optical_behavior`. Used by the Designer (render behavior), the Agent (material knowledge), and the pricing crosswalk.
```sql
select m.material_ref, m.product, r.knowledge, r.optical_behavior
from sign_materials m join reference r on r.normalized_id = m.manufacturer_normalized_id
where m.record_id = $record_id;
```

**The common case is hybrid (A + B):** filter to a category or constraint, then rank the survivors by semantic relevance. One query, because it's all in Postgres.
```sql
select s.record_id, c.text, (c.embedding <=> $q) as dist
from signs s join kb_chunks c on c.source_id = s.record_id
where s.fabrication_family = 'channel_letter'
order by dist limit 10;
```

---

## The query API (the contract consumers bind to)

Consumers bind to this surface, not to raw SQL and not to the files. Four functions cover every view:

- `search(query, filters?, k?)` — hybrid B+A. The agent's and Designer's main entry.
- `filter(criteria)` — pattern A only. Faceted/exact.
- `getRecord(id, { resolveRefs })` — one record, optionally with C applied.
- `resolveMaterial(ref)` — pattern C standalone.

Implement as Supabase RPC (Postgres functions) plus a typed client, or a thin Vercel route in front. Either way this API is the published, versioned contract. A record-schema bump (v1.3 to v1.4) changes the loader's column mapping; the API stays stable unless a new capability is added.

---

## Sync pipeline (records → index)

Re-runnable and incremental, because the corpus is living and you're still adding files.

1. Read `records/`, `reference/`, `canon/`.
2. Validate each record against the schema (the existing gate). Invalid records never enter the index.
3. Upsert into `signs` / `sign_components` / `sign_materials` / `reference` by id. Skip rows whose `content_hash` is unchanged.
4. Chunk the text fields of changed records and the canon entries: `plain_language_summary` -> summary, `rationale`/`tradeoffs`/`when_to_use` -> rationale, design observations -> design_obs, canon principles/exemplars -> their own types.
5. Embed only changed chunks; write vectors.

Run it after each Cowork batch, or on a Vercel cron, or on demand when you drop new drawings in. A full rebuild from the records is always valid since the index holds no source state.

---

## Embedding and indexing

- **Embedding model is pluggable.** A small, cheap text-embedding model is fine for this corpus; set `vector(N)` to its dimension. Keep the model name in config so it can change without touching the schema.
- **pgvector HNSW** index on `kb_chunks.embedding` for similarity.
- **btree** indexes on the hot filter columns: `sign_category`, `fabrication_family`, `illumination_method`, `record_type`, `mounting`.
- **GIN** index on `signs.raw` for ad-hoc jsonb queries.

---

## Scope and build order

MVP is these tables, the four API functions, and the sync job. Nothing else. No per-consumer logic in the surface; consumers compose their behavior from the API, the same by-concern-composes discipline the pricing repo uses. Derivations (completeness checklists, estimating priors) are downstream of this and separate.

1. Tables plus the loader: `records/` and `reference/` into `signs` / `components` / `materials` / `reference`. Pattern A works immediately.
2. Chunking, embeddings, and the HNSW index. Pattern B works.
3. The query API. Pattern C and the hybrid land here.
4. Point the first consumer (Substrate Agent) at the API and validate retrieval against real queries.

Step 1 is useful on its own: structured filtering over the corpus is live before any embedding exists.
