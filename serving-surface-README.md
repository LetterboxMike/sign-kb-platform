# Sign KB Serving Surface

The rebuildable read index over the source-of-truth sign records. This is a **derived projection** —
it can be dropped and rebuilt from `records/` + `reference/` at any time. See `PRD-serving-surface.md`,
`serving-surface-spec.md`, and `BUILD-PLAN-serving-surface.md` for the full design.

**Status: Phase 0 + Phase 1 complete** (schema + loader; structured filtering / pattern A live).
Phases 2–4 (embeddings, query API, sync automation) are not built yet.

## Setup

```bash
npm install
cp .env.example .env   # then fill DATABASE_URL (IPv4 Session pooler string from the Supabase dashboard)
```

Config lives in `.env` (see `.env.example`). `DATABASE_URL` is the only value the loader needs;
the embedding vars are Phase 2 placeholders.

## Commands

| command | what it does |
|---|---|
| `npm run check` | Phase 0 acceptance: connects to Postgres, confirms the `vector` extension, validates a sample record through the gate |
| `npm run load` | Incremental sync — loads new/changed records, skips unchanged (keyed on `content_hash`), drops orphans |
| `npm run load:rebuild` | Full rebuild — truncates and reloads from the corpus (always valid; the index holds no source state) |
| `npm test` | Typecheck-clean test suite: validation-gate, mapping, and DB-backed acceptance (auto-skips the DB suite if `DATABASE_URL` is unset) |

## How it works

- **DDL** (`supabase/migrations/0001_init.sql`): `signs` (one row per record, hot fields promoted to
  columns, full record in `raw` jsonb), `reference`, `sign_components`, `sign_materials`; btree indexes
  on the hot filter columns, GIN on `signs.raw`.
- **Gate** (`src/validate.ts`): every record is validated with Ajv against `sign-record.schema.json`
  (the same contract `validate.py` uses). An invalid record never enters the index.
- **Loader** (`src/loader.ts`): reference-first (FK target), incremental via `content_hash`, batched
  multi-row upserts, resilient to dangling material→reference FKs (kept as a row, FK nulled).

## Intentional transforms (not fidelity gaps)

- **`reference.depth`** is normalized to the spec's `stub | researched` vocabulary
  (source `"stub_expand_later"` → `"stub"`; `provenance: "researched"` → `"researched"`). The verbatim
  source value remains available via the reference file; nothing is lost.
- **Numeric promotion** (`width_in`, `height_in`, `area_sqft`, `sides`): non-scalar values such as a
  range (`"5.7-10.2"`) are promoted as `NULL` but remain queryable in `raw` (`raw->'dimensions'->>'area_sqft'`).
  Promote only clean, filterable scalars; everything else stays in `raw`.
