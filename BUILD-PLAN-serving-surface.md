# Build Plan — Sign KB Serving Surface

Build in vertical slices. Each phase ends at a verifiable state. Do not start a phase until the prior one's acceptance criteria pass. Reference `serving-surface-spec.md` for the DDL, queries, and API shapes.

---

## Phase 0 — Setup

**Tasks**
- Initialize the project (TypeScript, the Nuxt/Vercel ecosystem).
- Create a Supabase project; enable the `vector` extension.
- Wire env/config: Supabase URL + service key, embedding-model name + dimension, paths to `records/`, `reference/`, `canon/`.
- Vendor or reference the validation gate (`validate.py` or a TS port) so the loader can call it.

**Acceptance**: app connects to Supabase; `vector` extension present; config resolves; the gate runs against one sample record and reports valid.

---

## Phase 1 — Schema + loader (pattern A live)

**Tasks**
- Create the migration for `signs`, `sign_components`, `sign_materials`, `reference` (DDL in the spec). btree indexes on the hot filter columns; GIN on `signs.raw`.
- Build the loader: read `records/` and `reference/`, validate each record through the gate, promote the filter columns, keep the full record in `raw`, compute `content_hash`, upsert by id.
- Skip rows whose `content_hash` is unchanged.

**Acceptance**
- `select count(*) from signs` equals the count of valid records in `records/`.
- An invalid record is rejected by the loader and absent from `signs`.
- Re-running the loader with no file changes updates zero rows.
- A known pattern-A query returns the expected `record_id`s (e.g. halo-lit monuments with a concrete base, from the spec).
- Component and material rows join correctly to their parent record.

Phase 1 is independently useful: structured filtering over the whole corpus works before any embedding exists.

---

## Phase 2 — Chunking + embeddings (pattern B live)

**Tasks**
- Create `kb_chunks` with `vector(N)` matching the model; HNSW index on the embedding.
- Chunk changed records and the canon: `plain_language_summary` to summary, `rationale`/`tradeoffs`/`when_to_use` to rationale, design observations to design_obs, canon principles/exemplars to their own types.
- Embed only changed chunks; write vectors.

**Acceptance**
- A known semantic query retrieves the expected record(s) in the top k.
- Re-running with one changed record re-embeds only that record's chunks.
- Canon principles and exemplars are retrievable alongside sign chunks.

---

## Phase 3 — Query API + reference resolution (pattern C + hybrid)

**Tasks**
- Implement `search(query, filters?, k?)` (hybrid B+A), `filter(criteria)` (A), `getRecord(id, { resolveRefs })`, `resolveMaterial(ref)` (C).
- As Supabase RPC plus a typed client, or a thin Vercel route. This API is the published, versioned contract.

**Acceptance**
- Each function returns the documented shape.
- `search` with a filter restricts the candidate set, then ranks by similarity (one query).
- `getRecord(id, { resolveRefs: true })` returns the record with materials resolved to reference entries including `optical_behavior`.
- `resolveMaterial(ref)` returns the full reference entry.

---

## Phase 4 — Sync automation + ops

**Tasks**
- A CLI/script for full rebuild and for incremental sync.
- Schedule incremental sync (Vercel cron) and/or a post-batch hook so each Cowork batch and each added drawing updates the index.

**Acceptance**
- Post-batch sync updates only changed records and their chunks.
- A full rebuild from `records/` reproduces an equivalent index (counts and a sample of queries match).

---

## Phase 5 — First consumer validation

**Tasks**
- Point the Substrate Agent at the query API.
- Build a small retrieval eval set: ~15 natural queries with expected record(s).

**Acceptance**
- The Agent retrieves relevant records for the eval queries.
- The eval set runs as a check and passes a set threshold.

---

## Testing strategy

- **Per pattern**: fixture queries for A, B, C with known expected results.
- **Idempotency**: load twice, assert zero changed rows on the second run.
- **Incremental**: change one record, assert only its rows/chunks update.
- **Gate**: feed an invalid record, assert it is rejected and absent.
- **Schema-bump**: add a record using a new (valid) enum value, assert it loads and the API still returns the documented shape.
- **Rebuild**: drop and rebuild, assert equivalence to the incremental index.
- **Retrieval eval**: the Phase 5 set, run on demand.

---

## Open decisions (defaults chosen so build is not blocked)

- **Embedding model**: pick a small, cheap text-embedding model; set `vector(N)` to its dimension; keep the name in config so it can change without a schema change. Default to a small general model.
- **API form**: Supabase RPC plus a typed client is the lean default; a Vercel route is fine if a consumer needs an HTTP boundary. Either way the four-function contract is fixed.
- **Loader language**: TS in-repo is the default so it shares the app toolchain; a Python loader reusing `validate.py` directly is acceptable if simpler.

None of these block any phase. Change them later without touching the table schema or the API contract.
