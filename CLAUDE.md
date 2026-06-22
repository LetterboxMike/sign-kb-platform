# CLAUDE.md — KB Platform (core)

## What this project is
The platform core for the Sign Knowledge Base: a Supabase data core (system of record + the
four-function query API), a Next.js + shadcn console (search, browse, record detail), a chat
agent, the design-taste ranker, the Eve ingestion agent, the review/approval queue, roles,
governed self-correction, and admin. Build it per `platform-build-plan.md` (how + the gates),
`PRD-kb-platform.md` (what + why), `platform-architecture.md` (the map + scope line), and
`serving-surface-spec.md` (the read-layer design). `sign-record.schema.json` is the record
contract; the extraction skill + contract are the ingestion playbook. Where these and the older
standalone serving-surface docs (`BUILD-PLAN-serving-surface.md`, `PRD-serving-surface.md`)
disagree on sequencing or the write path, **the platform plan wins.**

## The invariant that governs everything
**The database is the system of record; JSON export is the portability layer.** Records are
written and validated *in the DB* (the write-time gate, `sign-record.schema.json`). An invalid
record never reaches `status='live'`. Versioned JSON export (per record + full corpus) is a
first-class output — what you hand to Bryant, commit for versioning, and keep as backup — and a
full rebuild from a current export must always be valid. The existing 229 records were loaded via
JSON import. Note this is the *opposite* of the original serving-surface invariant (which made
the flat files the source); the platform decision in `PRD-kb-platform.md` deliberately flipped it.

## Stack
- **Data core:** Supabase (Postgres + pgvector), project `paezripqqyoetyjoycdd`. Filter, vector
  similarity, and reference joins resolve in one query — that's why Postgres, not Convex.
  Embeddings: OpenAI `text-embedding-3-large`, stored `halfvec(3072)` + HNSW. Model/dim in config.
- **Read app:** a plain Next.js + shadcn/ui app in `web/`, on Vercel, consuming the query API.
  NOT wrapped in an agent framework. Chat is retrieval over the query API through gpt-5.4.
- **Ingestion engine (Phase 2):** Eve, for the extraction pipeline only. The extraction skill is a
  portable markdown playbook; the schema + contract are portable assets that do not depend on Eve.

## The write path (system of record)
- `src/write.ts` — `writeRecord(record, { status, ... })` is the single-record write: validate
  (gate) → upsert `signs`/`sign_components`/`sign_materials` → chunk → embed, sharing all
  projection logic with the loader via `map.ts`/`chunk.ts`. The in-app ingestion approval
  (Phase 2) and governed corrections (Phase 3) call it. `setRecordStatus` flips lifecycle state.
- `src/loader.ts` — the JSON **import** utility (bootstrap/restore from files). Idempotent and
  incremental on `content_hash`. Upsert-only by default; it only deletes DB rows absent from the
  files under `--mirror` (or `--rebuild`, which truncates + reloads). A plain import never deletes.
- `src/export.ts` — JSON **export** (`npm run export`): the DB back out to per-record files +
  `corpus.json` + a versioned `manifest.json`. After any write that mutates the corpus (e.g. a
  ranker grade roll-up), run export to refresh the JSON layer; a rebuild must be from a current export.

## Conventions
- Promote a field to its own column only if a consumer filters on it. Everything else stays in
  `signs.raw` (jsonb), reachable via `raw -> 'path'` with the GIN index.
- The four-function query API (`search`, `filter`, `getRecord`, `resolveMaterial`, `src/api.ts`)
  is the contract. Consumers bind to it, never to raw SQL and never to the files. It defaults to
  `status='live'`; pass `status: '*'` (review UI) to see staging/rejected. Keep it stable across
  record-schema bumps.
- `signs.status` is `live | staging | rejected`. `submitted_by` / `reviewed_by` carry provenance
  (Phase 2). `taste_comparisons` feeds the ranker's Elo roll-up into `quality_grade`. `app_users`
  is app-level role governance (`admin | contributor | viewer`).

## Guardrails — do not
- Do not let an invalid record reach `status='live'`. Never bypass the write-time gate.
- Do not write extracted records straight to `live`. Ingestion is human-gated: uploads extract to
  `staging` and reach `live` only on admin approval.
- **Governed self-correction, never auto-rewrite.** A correction proposes a change set, shows the
  diff, re-validates + re-embeds affected records, runs the eval suite, and commits only on
  explicit approval, with an audit row and a working revert. A chat correction never writes to the
  corpus directly.
- Do not add per-tenant data isolation to the KB. It is universal industry knowledge. App roles
  gate who can write/approve; tenant data (shop costs, voice) lives elsewhere (the pricing catalog).
- Do not build the modules (sign/wrap mockup generators, ADA takeoff, pricing engine, production
  scheduler) or the derivations (completeness checklists, estimating priors, typology). They attach
  to this core later against its contracts. Build the platform core only.
- Do not re-derive provenance or PII handling — done upstream in extraction; records arrive clean.

## Build order and what "done" means
Three phases, each ending at its acceptance criteria **and** its eval gate (in
`platform-build-plan.md`), verified against the real ~229-record corpus. Swarm freely within a
phase; **stop and surface at each phase boundary** with the eval results before starting the next.
1. **Data core + Console + Chat + Ranker (read).** System-of-record write path, query API, console,
   chat (cited retrieval), pairwise ranker. Independently useful: search/chat/grade before ingestion.
2. **Ingestion + Review + Multi-user (write).** Eve extraction → staging → review/approve, roles +
   auth, JSON export. Gate: the held-out extraction diff passes before contributor ingestion opens.
3. **Governed self-correction + admin.** Correction workflow, vendor/material ingestion, vocab review.

## Inputs in the repo
- `records/` — the seed corpus, imported into the DB; also the default export target / backup.
- `reference/` — the normalized manufacturer/material reference.
- `canon/` — design principles and exemplars (embedded alongside sign chunks; not gated, never in `signs`).
- `sign-record.schema.json` — the record contract the write-time gate validates against.

## Security note (Phase 2 — done)
**App access is gated server-side, not by RLS.** The app reaches the data core only through `pg`
over `DATABASE_URL` as the Supabase `postgres` role (which has `BYPASSRLS`), so the real
authorization gate is `web/lib/auth.ts` — `requireRole`/`requireAdmin`/`requireContributor`,
applied to every write-path server action and route handler. Roles (`app_users.role`:
`viewer`<`contributor`<`admin`) are self-provisioned on first login; the project owner bootstraps to
`admin` via `ADMIN_EMAILS` (defaults to the owner's email). Manage roles in the admin console.

**RLS is defense-in-depth.** All data-core + platform tables have RLS *enabled* (not forced, so the
owner connection still works) with **no permissive policies** — deny-by-default for anon/authenticated
via PostgREST (migration `0009_rls.sql`). That migration also reconciled production drift: three
manually-added `USING (true)` policies (`signs_read`, `reference_read`, `ingestion_jobs_app`) that had
exposed the tables to the anon/authenticated keys were dropped. The anon key (shipped in the browser
for auth only) now carries no table access. If a future surface needs direct PostgREST reads, add a
*narrow* policy (e.g. `signs` SELECT to anon `using (status='live')`) — never a blanket `USING (true)`.
Note: this Supabase project is shared with the separate ADA-takeoff app (`ada_*` tables); leave those
and their policies alone.
