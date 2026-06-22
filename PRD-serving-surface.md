# PRD — Sign KB Serving Surface

## One line
Build the rebuildable read index over the source-of-truth sign records that exposes three access patterns through one query API, so every product can consume the knowledge base without its own pipeline.

## Problem
The extraction pipeline produces a growing corpus of validated JSON sign records (`records/`), a normalized manufacturer reference (`reference/`), and a design canon (`canon/`). Nothing can query them yet. Each consuming product (the Substrate Agent, the Designer, the pricing app, Sign Spotter, the Tradecraft portal) needs a different shaped read over the same corpus. Without a shared surface, each one grows a bespoke pipeline and the corpus forks.

## Goal
One serving surface: a derived Postgres + pgvector index over the records, exposing structured filter, semantic retrieval, and reference resolution, behind a single versioned query API. The index is a projection. The JSON records remain the source of truth and the index can be dropped and rebuilt from them at any time.

## Consumers and what each needs
| Consumer | Pattern(s) |
|---|---|
| Substrate Agent | semantic retrieval; reference resolution |
| Substrate Designer | semantic retrieval; reference resolution (material `optical_behavior`) |
| Substrate app / pricing | structured filter |
| Sign Spotter | structured filter (the taxonomy); semantic identify-from-text |
| Tradecraft portal | semantic retrieval |

Three of five lead with semantic retrieval, so the surface is the unlock for most of the roadmap.

## In scope
- Four tables: `signs`, `sign_components`, `sign_materials`, `reference`, plus `kb_chunks` for embeddings.
- The loader/sync: records and reference and canon into the index, validated through the existing gate, idempotent and incremental.
- The three access patterns and the common hybrid (filter then rank).
- The query API: `search`, `filter`, `getRecord`, `resolveMaterial`.
- Full-rebuild and incremental-update paths.

## Out of scope (non-goals)
- The derivations (completeness checklists, estimating priors, typology). Downstream of this, separate.
- Any consumer's own logic (the Agent's prompting, the Designer's render pipeline, the app UI).
- Authoring or mutating records. The serving layer is read-only over the corpus; records change only via the extraction pipeline.
- **Per-tenant isolation.** This KB is universal industry knowledge, shared across all tenants, the platform tier. Tenant-specific data (a shop's costs, voice) lives in the pricing catalog, not here. So this is one shared read database with no tenant scoping. Do not build multi-tenant isolation into it.

## Success criteria
1. All three patterns return correct results against the real corpus.
2. The loader is idempotent: re-running with no changed files touches zero rows.
3. The loader is incremental: changing one record re-syncs and re-embeds only that record.
4. A full rebuild from `records/` reproduces an equivalent index (the surface holds no source state).
5. The validation gate runs in the loader: an invalid record never enters the index.
6. A record-schema bump maps into columns via the loader without breaking the query API.
7. A natural-language query through `search` retrieves the relevant records in the top results.

## Architecture
See `serving-surface-spec.md` for the full design: the table DDL, the three patterns with example queries, the API contract, the sync pipeline, and the indexing plan. Stack call: the index is Supabase (Postgres + pgvector), not Convex, because filter, vector similarity, and reference joins must resolve in one query. Convex stays the app layer and calls the query API.

## Dependencies / inputs
- The records corpus (`records/`), growing; reference (`reference/`); canon (`canon/`).
- `sign-record.schema.json` (the contract) and the validation gate (`validate.py`).
- An embedding model (pluggable; dimension set in config).
- A Supabase project with the `vector` extension enabled.
