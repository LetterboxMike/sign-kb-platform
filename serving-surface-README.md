# Sign KB Serving Surface

The rebuildable read index over the source-of-truth sign records. This is a **derived projection** —
it can be dropped and rebuilt from `records/` + `reference/` + `canon/` at any time. See
`PRD-serving-surface.md`, `serving-surface-spec.md`, and `BUILD-PLAN-serving-surface.md` for the full design.

**Status: Phase 0–2 complete** — structured filtering (pattern A) and semantic retrieval (pattern B)
are live. Phases 3–4 (the four-function query API, sync automation) are not built yet.

## Setup

```bash
npm install
cp .env.example .env   # then fill DATABASE_URL (IPv4 Session pooler string) and OPENAI_API_KEY
```

Config lives in `.env` (see `.env.example`). `DATABASE_URL` drives the structured load; `OPENAI_API_KEY`
is required for the embedding pass (Phase 2). The embedding model and dimension are set by
`EMBEDDING_MODEL` / `EMBEDDING_DIM`.

## Commands

| command | what it does |
|---|---|
| `npm run check` | Phase 0: connects to Postgres, confirms the `vector` extension, validates a sample record |
| `npm run chunks:preview` | Dry run — shows what will be chunked (records + canon) with no embedding or DB writes |
| `npm run load` | Incremental sync — structured rows (keyed on `content_hash`) **and** embeddings (only new/changed chunks); drops orphans. Add `--no-embed` to skip embeddings |
| `npm run load:rebuild` | Full rebuild — truncates and reloads everything from the corpus (always valid; the index holds no source state) |
| `npm test` | Typecheck-clean suite: gate, mapping, and DB-backed Phase 1 + Phase 2 acceptance (DB suite auto-skips without `DATABASE_URL`; Phase 2 also needs `OPENAI_API_KEY`) |

## How it works

- **DDL** — `signs` (hot fields promoted, full record in `raw` jsonb), `reference`, `sign_components`,
  `sign_materials` ([0001_init.sql](supabase/migrations/0001_init.sql)); `kb_chunks` for embeddings
  ([0002_kb_chunks.sql](supabase/migrations/0002_kb_chunks.sql)). btree on hot filter columns, GIN on
  `signs.raw`, HNSW on `kb_chunks.embedding`.
- **Gate** ([src/validate.ts](src/validate.ts)) — every record is validated with Ajv against
  `sign-record.schema.json`. An invalid record never enters the index. Canon is **not** gated.
- **Structured load** ([src/loader.ts](src/loader.ts)) — reference-first, incremental via `content_hash`,
  batched upserts, resilient to dangling material→reference FKs.
- **Semantic load** ([src/chunk.ts](src/chunk.ts), [src/embed.ts](src/embed.ts)) — records → `summary` /
  `rationale` / `design_obs` chunks; canon → `principle` / `exemplar` chunks. Embeds only new/changed
  chunks (per-chunk `content_hash` including the model), deletes orphaned chunks.
- **Retrieval** ([src/retrieve.ts](src/retrieve.ts)) — `semanticSearch()` ranks `kb_chunks` by cosine
  distance (`<=>`). This is the pattern-B primitive the Phase 3 query API will build on.

## Embeddings

`text-embedding-3-large` at its native **3072** dims, stored as **`halfvec(3072)`** with an HNSW
`halfvec_cosine_ops` index. (pgvector indexes the standard `vector` type only to 2000 dims, but supports
HNSW on `halfvec` up to 4000; requires pgvector ≥ 0.7 — the project runs 0.8.) Changing the model/dim is a
config + migration change; the chunking and loader logic are unaffected.

## Intentional transforms (not fidelity gaps)

- **`reference.depth`** is normalized to the spec's `stub | researched` vocabulary (source
  `"stub_expand_later"` → `"stub"`); the verbatim value remains in the reference file.
- **Numeric promotion** (`width_in`, `height_in`, `area_sqft`, `sides`): non-scalar values such as a range
  (`"5.7-10.2"`) promote as `NULL` but stay queryable in `raw`.
