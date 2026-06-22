# Platform Build Plan + Eval Suite

Scope: the platform core only — data core, console, chat, ranker, Eve ingestion, review, governed self-correction, admin. The modules in `platform-architecture.md` are out of scope here; they attach later against the contracts this core exposes.

Authoritative docs: `platform-architecture.md` (the map and scope line), `PRD-kb-platform.md` (what and why), this plan (how and the gates), `serving-surface-spec.md` (read-layer design: tables, query API, embeddings, search), `sign-record.schema.json` (the record contract), the extraction skill and contract (the ingestion playbook). Where this plan and the standalone serving-surface PRD/BUILD-PLAN disagree on sequencing or the write path, this plan wins.

## Stack
- **Read app:** Next.js + shadcn/ui on Vercel. Console, chat, ranker, admin. Not an agent framework; a normal app on the query API.
- **Data:** Supabase (Postgres + pgvector), the same project as the serving surface. The query API from `serving-surface-spec.md` is reused, not rebuilt. **System of record is the database; JSON export is the portability layer.** Validation moves to a write-time gate.
- **Ingestion engine:** Eve, for the extraction pipeline only. Subagents reproduce the Cowork multi-agent extraction; the extraction skill ports in as a markdown playbook; the sandbox handles file processing; durable workflows handle resumable bulk ingest; evals are the quality gate. Model roster via AI Gateway: Claude Opus 4.8 orchestrator delegating to cheaper workers (Sonnet / Haiku or gpt-5.4-class) per task.
- **AI:** OpenAI text-embedding-3-large for embeddings (existing key). Chat is retrieval over the KB through one capable model.

## Data model — deltas beyond the serving tables
The serving tables (`signs`, `sign_components`, `sign_materials`, `reference`, `kb_chunks`) stay as specified. The platform adds:

```sql
-- live vs staged vs rejected, plus provenance of who touched it
alter table signs add column status text not null default 'live'
  check (status in ('live','staging','rejected'));
alter table signs add column submitted_by uuid;     -- contributor
alter table signs add column reviewed_by uuid;       -- approving admin
-- the query API defaults to status='live'; review UI reads 'staging'

create table ingestion_jobs (
  id uuid primary key default gen_random_uuid(),
  uploaded_by uuid not null,
  source_filename text, source_path text,
  status text not null default 'queued'          -- queued|extracting|review|done|failed
    check (status in ('queued','extracting','review','done','failed')),
  eve_session_id text,                            -- the durable Eve run
  candidate_record_ids text[],                    -- signs.record_id produced
  created_at timestamptz default now()
);

create table corrections (
  id uuid primary key default gen_random_uuid(),
  prompt text,                                    -- the correction in plain language
  change_set jsonb not null,                      -- proposed diffs (record_id, field, before, after)
  eval_result jsonb,                              -- pass/fail + scores
  status text not null default 'proposed'         -- proposed|approved|rejected|reverted
    check (status in ('proposed','approved','rejected','reverted')),
  approved_by uuid, created_at timestamptz default now(), committed_at timestamptz
);

create table taste_comparisons (
  id uuid primary key default gen_random_uuid(),
  record_a text references signs(record_id),
  record_b text references signs(record_id),
  winner text,                                    -- record_a | record_b | skip
  judge uuid, created_at timestamptz default now()
);
-- Elo rolled up from comparisons writes back to signs.quality_grade

create table app_users (
  id uuid primary key,                            -- supabase auth user
  role text not null default 'viewer' check (role in ('admin','contributor','viewer'))
);
```
Note: `app_users.role` is app-level governance, not KB tenant isolation. The KB stays universal and unscoped; only write/approve permissions are gated.

## Phases — each ends at its acceptance criteria AND its eval gate

### Phase 1 — Data core + Console + Chat + Ranker (read)
Build: reconcile the serving data layer to the DB-as-system-of-record write path (records written and validated in-DB, JSON import to load the existing 229, JSON export available); the query API; the console (search via filter + semantic, browse, record detail with resolved materials and `optical_behavior`); the chat agent (retrieval over the query API, answers cite the records used); the ranker (pairwise two-card UI, comparisons → Elo → `quality_grade`).
Acceptance: the existing 229 records import and are searchable; a known filter and a known semantic query return the expected records; chat answers cite resolvable records; a run of pairwise comparisons produces a stable `quality_grade` ordering; JSON export round-trips.
Eval gate: the retrieval eval set passes (below); chat citations resolve with zero fabricated records.

### Phase 2 — Ingestion + Review + Multi-user (write)
Build: the Eve ingestion agent (upload single and bulk → subagent extraction on the skill → candidate records at `status='staging'`, gated by the schema on write); the review queue (candidate beside source drawing, edit, approve to `live`, or reject); roles and auth; JSON export of the live corpus.
Acceptance: a drawing uploads, extraction yields staged candidates, an admin approves them to `live`, and they become searchable; an invalid record never reaches `live`; a contributor cannot publish directly; bulk upload survives a restart (durable workflow).
Eval gate (the important one): the **held-out extraction diff** passes its threshold before ingestion is opened to contributors — re-extract a held-out set of already-extracted drawings and diff field-level against the known-good records.

### Phase 3 — Governed self-correction + admin
Build: the correction workflow (propose change set → show diff → re-validate and re-embed affected records → run the eval suite → commit on approval → audit row → one-click revert); vendor/material ingestion into `reference`; vocab and `proposed_new_term` review; reference management; saved queries.
Acceptance: a correction produces a reviewable diff, applies only on approval, writes an audit row, and reverts cleanly; a correction that would regress the eval suite is blocked.
Eval gate: the full suite passes after any committed correction (no regression).

## Eval suite (the test gate)
Built as Eve evals where ingestion-related, and as app tests for the read side. Run on deploy and on schedule.

1. **Retrieval (read):** ~20 known queries → expected record(s) in top-k. Pattern A/B/C fixtures with known results.
2. **Chat grounding:** answers cite only retrieved records; citations resolve; no fabricated record ids.
3. **Extraction (the gate):** held-out already-extracted drawings re-run through the Eve pipeline, output diffed field-level against known-good records; schema-valid; PII hits = 0; meets a match-rate threshold before contributor ingestion opens.
4. **Write gate:** an invalid record is rejected on write and never reaches `status='live'`.
5. **Idempotency + round-trip:** re-ingesting an unchanged drawing creates no duplicates; JSON export then import reproduces the corpus.
6. **Ranker stability:** repeated comparison sets converge to a consistent ordering.
7. **Correction regression:** after a committed correction, the full suite still passes; revert restores prior state exactly.

## How the build runs
Within a phase, swarm freely — parallel agents, aggressive building. Between phases, stop at the acceptance criteria and the eval gate and surface for review. Autonomous within a slice, gated between slices. Phase 1 is independently useful (you can search, chat, and grade the KB before ingestion exists). Do not begin a phase until the prior gate passes.
