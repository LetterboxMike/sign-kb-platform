# Claude Code Master Prompt — KB Platform (core)

> Paste from the platform repo root. Ultracode/swarm is fine within a phase; the checkpoints between phases are not optional.

---

You are building the KB Platform core. The full plan is in this repo. Build to it. Do not expand scope.

## Read first, in this order, before writing code
1. `platform-architecture.md` — the map, the three data classes, and the scope line. The single most important thing in it: this KB is the universal sign-domain knowledge layer; it is not the system of record for jobs, costs, schedules, or other domains, and you are building the platform core, not the modules.
2. `PRD-kb-platform.md` — what each part is and why, the users and governance, the success criteria.
3. `platform-build-plan.md` — the stack, the data-model deltas, the three phases, and the eval suite. This is your build order and your definition of done.
4. `serving-surface-spec.md` — the read-layer design (tables, query API, embeddings, search) you build the data core on.
5. `sign-record.schema.json` (v1.6) — the record contract. And the extraction skill + contract — the ingestion playbook.

If your plan diverges from these, you have gone wrong. State your understanding and your Phase 1 plan before coding.

## Scope — build exactly this, nothing more
The platform core: the data core (Supabase, system of record, query API), the console (search, browse, record detail), the chat agent, the design-taste ranker, the Eve ingestion agent, the review/approval queue, roles, governed self-correction, and admin. Three phases per the build plan.

**Out of scope — do not build, even if it seems natural:** the sign or vehicle-wrap mockup generators, the ADA/wayfinding takeoff tool, the decorated-apparel tools, the production/workflow scheduler, the pricing engine. Those are separate modules that attach to this core later. If you find yourself starting one, stop.

## Guardrails (do not violate)
- **The database is the system of record; JSON export is the portability layer.** Validation is a write-time gate using `sign-record.schema.json`. An invalid record never reaches `status='live'`. Load the existing 229 records via JSON import.
- **The read app is a plain Next.js + shadcn app on the query API.** Do not wrap the console or chat in an agent framework. Eve is used only for the ingestion/extraction pipeline.
- **Governed self-correction, never auto-rewrite.** A correction proposes a change set, shows the diff, re-validates and re-embeds the affected records, runs the eval suite, and commits only on explicit approval, with an audit row and a working revert. A chat correction must never write to the corpus directly.
- **The KB stays universal.** App-level roles gate who can write and approve; do not add per-tenant data isolation to the KB itself.
- **Ingestion is human-gated.** Uploaded drawings extract to `status='staging'` and reach `live` only on admin approval. Never write extracted records straight to live.

## Ingestion engine (Phase 2)
Build the extraction pipeline as an Eve agent. Subagents reproduce the multi-agent extraction; the extraction skill is the markdown playbook; the sandbox does file processing; durable workflows handle bulk; evals are the gate. Model roster via AI Gateway: Claude Opus 4.8 as orchestrator, delegating to cheaper workers (Sonnet / Haiku or gpt-5.4-class) per task. Eve is in beta — pin versions and keep the extraction skill, contract, and schema as portable assets that do not depend on it.

## How to run
- **Within a phase: swarm freely.** Parallel agents, aggressive building, write tests as you go.
- **Between phases: stop.** A phase is done only when its acceptance criteria and its eval gate (in the build plan) both pass against the real 229-record corpus. Commit at the boundary, then **notify me with the eval results and what you built, and wait** before starting the next phase.
- Phase 1 is independently useful: search, chat, and grade the KB before ingestion exists. Ship it solid before moving on.
- The Phase 2 gate is the one that matters most: the held-out extraction diff must pass before ingestion opens to contributors. Do not skip it.

## First action
Confirm you have read the five inputs. State your understanding of the platform core in a few lines, your Phase 1 plan, and anything you need from me (Supabase project keys, the OpenAI key, the AI Gateway / model access for Eve). Reconcile the in-progress serving-surface work to the system-of-record write path. Then build Phase 1, run its eval gate, and notify me.
