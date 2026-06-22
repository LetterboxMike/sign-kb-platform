# PRD — KB Platform (web app)

One web app that does two jobs: lets a human use the knowledge base directly (search, browse, chat, verify), and lets contributors feed it (upload drawings, extract them in the cloud, review, approve). It sits on the serving surface already being built and becomes the operator console and the ingestion front door for the whole KB.

Companion to `serving-surface-spec.md`, `KB-as-data-product.md`, and the build docs. This app consumes and produces the same KB those describe; it does not fork it.

## Why
Two needs, both real:
1. **Use the KB as a tool.** Search it, chat with it, pull a record and verify it, without standing up Bryant's agent and without Cowork. A working interface to the knowledge, today.
2. **Move ingestion to the cloud, and open it up.** Get file processing off one machine and out of Cowork, onto an app where other contributors can also upload drawings, so the corpus grows with more hands and more context.

## The decision this forces: where the source of truth lives
Until now the source of truth has been the flat JSON records, with the database a rebuildable projection. A multi-contributor cloud app changes that. You cannot have several people uploading and extracting concurrently while a git folder of files is the system of record; that is a write-contention and split-brain problem.

**Call: Supabase becomes the system of record. JSON export becomes the portability layer.**
- New records are written directly to the database, gated by `sign-record.schema.json` on write exactly as the file pipeline gated them. The full record is preserved in the `raw` jsonb column, so nothing is lost.
- Versioned JSON export (per record and full corpus) is a first-class feature. That is what you hand to Bryant, commit to the repo for versioning, and keep as backup. The inspectable, portable, rebuildable property of the flat files is retained; it just becomes an output instead of the live store.
- The schema stays the contract. Validation moves from a file-time gate to a write-time gate. Same gate, same discipline.

**What this changes about the in-flight serving surface:** nothing is wasted. Its tables, query API, embeddings, and search are the data core this app is built on. Only the write path changes: instead of Cowork writing files and a loader importing them, the app's ingestion writes validated records straight to the tables, and "rebuild from files" becomes "export to files." Tell Claude Code the loader's job shifts from file-import to serving the in-app write path plus a JSON import/export utility; the read side it is building is unchanged.

## How it relates to Substrate
One KB, two front doors. Bryant's programmatic agent and products consume the KB through the query API and the derivations. This app is the human console plus the ingestion service, on the same database and the same query API. Same source of truth, different door. This app is not the Substrate Agent, the Designer, the pricing app, or the survey tool; it is the operator and contributor tool that feeds and inspects the KB those products draw from.

## Users and governance
- **Admin** (you): full search and chat, approve or reject candidate records, edit records, run the vocab and grading passes, manage the reference table, manage users, export.
- **Contributor**: upload drawings, see the status of their uploads, view the KB. Cannot publish to the live KB directly.
- **Viewer** (optional): search, browse, chat only.

Governance flow, which preserves the calibration discipline in a multi-person setting: a contributor uploads, extraction produces candidate records, those land in a review state, an admin approves them into the live KB or sends them back. The live KB is never written to blindly.

## Feature set
**KB console (read).** Structured filter and semantic search over the corpus, a browsable list, and a full record detail view with materials resolved to their reference entries and `optical_behavior` shown. Saved queries. This is the query API surfaced as a UI.

**Chat agent.** gpt-5.4 over the KB by retrieval: the agent pulls relevant records and reference entries through the query API, answers in plain language, and cites the records it used so you can click through and verify. This is how you interrogate the KB conversationally and test that it actually knows what it should.

**Ingestion.** Single and bulk upload of drawings (PDF and images). Server-side extraction runs the ported extraction skill and contract against gpt-5.4 (vision for the pages plus the authoring prompt), produces candidate records, runs them through the schema gate, and routes clean ones to staging and flagged ones to review. This is the Cowork pipeline as a cloud service.

**Review queue.** The human-in-the-loop. View candidate records side by side with the source drawing, edit fields, approve to the live KB, or reject. Where the `proposed_new_term` flags surface for a vocab decision.

**Design-taste ranker (core).** The pending grading pass lives here as a dedicated mode, not a side note. Records are graded by pairwise comparison ("which of these two is better?") rather than absolute swipe, which produces a more consistent ranking (Elo-style from many choices) at the same simple two-card UX, and is shareable so other designers' judgments can be folded in. Output lands as `quality_grade` on the records. This is what turns the canon from seeded principles into graded exemplars, so it gates the proof reviewer and the mockup work downstream.

**Governed self-correction (core).** When the KB answers wrong and you correct it, the correction does not rewrite the corpus directly. It proposes a change set, shows the exact diff (which records and fields), re-validates and re-embeds the affected records, runs the eval suite to confirm nothing else regressed, and commits only on your approval, with an audit trail and one-click revert. Propose, verify, approve, commit, audit. This maps onto the framework's approvals and evals.

**Admin.** Reference-table management, vocabulary and `proposed_new_term` review, user and role management, and JSON export (per record and full corpus, versioned).

## Stack
- **Frontend:** Next.js + shadcn/ui. You named shadcn, which is React-native, and this app is standalone from your Nuxt products so there is no reason to match their stack. (If you would rather stay in Nuxt, shadcn-vue is the equivalent; minor decision, default is Next.)
- **Data:** Supabase (the same project as the serving surface) + pgvector. The query API is reused, not rebuilt.
- **Ingestion engine:** the Eve agent framework, used only for the extraction pipeline. Subagents reproduce the Cowork multi-agent extraction, the existing extraction skill ports in as a markdown playbook, the sandbox handles file processing, durable workflows handle resumable bulk ingest, and built-in evals are the quality gate. Model roster via AI Gateway: a strong orchestrator (Claude Opus 4.8) delegating to cheaper workers (Sonnet / Haiku or gpt-5.4-class) per task. The read side (console, chat) does NOT use Eve; it is a plain app on the query API.
- **AI:** OpenAI for embeddings (text-embedding-3-large, the same key the search uses). Chat is retrieval over the KB through a single capable model. Extraction models are the Eve roster above.
- **Hosting:** Vercel.

## Phasing (vertical slices)
**Phase 1 — Data core + Console + Chat + Ranker (read).** The serving data layer (write path adjusted for the system-of-record decision below), the query API, the console (search, browse, record detail), the chat agent, and the design-taste ranker. Ships the use, verify, and grade value fast and at low risk, and the ranker starts populating `quality_grade` immediately.

**Phase 2 — Ingestion + Review + Multi-user (write).** The Eve ingestion agent, upload (single and bulk), the schema gate on write, the review and approval queue, roles and auth, and JSON export. The eval suite gates this: the held-out extraction diff must pass before ingestion opens to contributors. This is the larger build and the one that gets processing off your machine.

**Phase 3 — Governed self-correction + admin polish.** The correction workflow (propose, diff, re-validate, eval, approve, commit, audit), vendor/material ingestion, vocab and `proposed_new_term` review, reference management, saved queries.

This is the platform core. Every module in `platform-architecture.md` attaches to it afterward as its own scoped build against the contracts this core exposes; none are baked in here.

## Non-goals
- Not Bryant's Substrate Agent, Designer, pricing app, or survey tool. This is the operator and contributor console, not a customer product.
- Not the pricing engine or the derivations. Those are downstream and separate.
- Not a public product. Internal and contributor use, gated by auth.

## Success criteria
1. You can search and chat the KB and verify a record without Cowork and without Bryant's agent.
2. A contributor can upload a drawing, extraction produces candidate records, and an admin approves them into the live KB.
3. Every write passes the schema gate; an invalid record never reaches the live KB.
4. The full KB exports to versioned JSON at any time.
5. The serving surface query API is reused as the read layer, not duplicated.
6. Extraction quality in-app is comparable to the Cowork pipeline, measured against a held-out set of already-extracted drawings.

## The one open risk worth naming
Extraction quality now rides on gpt-5.4 plus the ported skill, run server-side, instead of the Cowork multi-agent process. The skill, contract, and validation gate all port over unchanged, and the review queue catches misses, but before trusting it at volume, re-run a handful of already-extracted drawings through the new pipeline and diff the output against the records you already have. That is success criterion 6, and it is the gate before opening ingestion to contributors.
