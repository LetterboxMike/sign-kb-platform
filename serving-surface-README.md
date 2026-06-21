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
| `npm run sync` | Alias of `load` — the post-batch hook to run wherever records are authored |
| `npm run verify:index` | Standing integrity tripwires (null/dim/model/dup/orphan/dangling-FK); exits non-zero on any violation. Also runs automatically after every `load` |
| `npm run eval` | Retrieval regression gate — runs the committed eval set against `search()` and checks hit-rate thresholds |
| `npm test` | Typecheck-clean suite: gate, mapping, and DB-backed Phase 1–3 acceptance (DB suite auto-skips without `DATABASE_URL`; search/Phase 2 also need `OPENAI_API_KEY`) |

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

## Query API

Consumers bind to [src/api.ts](src/api.ts) (typed client) or the HTTP boundary at
[api/kb.ts](api/kb.ts) (`POST { fn, ...args }`). Four functions cover every view:

- `search(query, filters?, k?)` — hybrid: embed, filter `signs`, rank survivors by cosine similarity (one query).
- `filter(criteria, limit?)` — pattern A; allowlisted facets + `material_category` / `component` existence.
- `getRecord(id, { resolveRefs })` — record + components + materials, optionally resolved to reference entries.
- `resolveMaterial(ref)` — a full reference entry (pattern C standalone).

## Sync & ops

- **Post-batch hook (primary):** run `npm run load` wherever records are authored (Cowork batch / CI / local)
  after dropping new drawings. Incremental and idempotent; re-embeds only changed chunks. Every run ends with
  the invariant check.
- **Full rebuild:** `npm run load:rebuild` — always valid; reproduces an equivalent index from the corpus.
- **Integrity:** `npm run verify:index` (or the auto-check after `load`) fails loudly on null/wrong-dim/multi-model
  embeddings, duplicate chunk keys, orphan rows, or dangling material FKs.

## Deploy (optional, Vercel)

[vercel.json](vercel.json) wires an hourly cron at [api/sync.ts](api/sync.ts) and exposes the query API at
[api/kb.ts](api/kb.ts). To deploy: set `DATABASE_URL`, `OPENAI_API_KEY`, and `CRON_SECRET` in the Vercel project
env. **Caveat:** the cron reads `records/` / `reference/` / `canon/` from the *deployed* commit, so it only
reconciles records present in the deployment — for a living local corpus the post-batch hook is the real sync path.
(`hnsw.ef_search` / index pinning is unnecessary at the current corpus size but worth revisiting at scale — see
[serving-surface-HANDOFF.md](serving-surface-HANDOFF.md).)

## Intentional transforms (not fidelity gaps)

- **`reference.depth`** is normalized to the spec's `stub | researched` vocabulary (source
  `"stub_expand_later"` → `"stub"`); the verbatim value remains in the reference file.
- **Numeric promotion** (`width_in`, `height_in`, `area_sqft`, `sides`): non-scalar values such as a range
  (`"5.7-10.2"`) promote as `NULL` but stay queryable in `raw`.
