# Sign KB Serving Surface — Handoff

Built autonomously through **all five phases** of `BUILD-PLAN-serving-surface.md`. Everything below
is live and committed. Read this first, then `serving-surface-README.md` for how to run it.

## What's built (Phases 0–5)

| Phase | Delivered | Acceptance |
|---|---|---|
| 0 Setup | Dedicated Supabase project, `vector` ext, TS project, config | `npm run check` green |
| 1 Schema + loader | `signs`/`reference`/`sign_components`/`sign_materials`, btree+GIN, Ajv gate, incremental loader | count==valid, gate rejects, idempotent, pattern-A |
| 2 Embeddings | `kb_chunks` `halfvec(3072)` + HNSW, chunking, OpenAI embeddings, incremental re-embed | 638 chunks, semantic query hits, canon retrievable |
| 3 Query API | `search`/`filter`/`getRecord`/`resolveMaterial` ([src/api.ts](src/api.ts)) + HTTP boundary | each returns documented shape; hybrid filter-then-rank |
| 4 Sync + ops | post-batch hook, `verify:index` tripwires, Vercel cron/route artifacts | rebuild reproduces equivalent index; incremental touches only changed |
| 5 Eval | 15-query regression gate ([src/eval.ts](src/eval.ts)) | records hit@5 13/13, hit@10 13/13; canon 2/2 |

**Verification:** two independent adversarial multi-agent reviews (Phase 1 and Phase 2) both returned
**pass / 0 high-severity** — raw fidelity lossless, column promotion clean, embeddings complete, chunk
text byte-exact, canon never leaked into `signs`, DDL/indexes conformant. **31/31 tests pass.**

**Live index:** project `paezripqqyoetyjoycdd` (us-west-1) — 229 signs, 322 components, 467 materials,
80 reference, 638 chunks, 0 null embeddings, 0 orphans/dangling FKs. (Corpus is living; it grew
145→229 during the build and the loader tracked it 1:1.)

## Decisions I made autonomously (reverse if you disagree)

1. **Dedicated Supabase project** `SignKB-ServingSurface` ($10/mo) — you approved this before going away.
2. **Embedding storage** `halfvec(3072)` + HNSW `halfvec_cosine_ops` — you chose this.
3. **Loader/gate in TS + Ajv** (not Python `validate.py`) — you chose this; `validate.py` kept as reference.
4. **Query API = typed TS client + thin Vercel route**, not Supabase RPC. The build plan allowed either;
   I chose the TS client (fully testable, matches the TS/Nuxt ecosystem) over brittle dynamic-plpgsql RPCs.
   If a non-TS/PostgREST consumer needs SQL-native RPCs, say so and I'll add them.
5. **Git scope:** committed only serving-surface code. `records/`, `reference/`, `canon/`, the planning
   docs, and `Original Docs/` are left untracked for you to decide how to version the corpus.

## Open decisions for you (none block the build; all are post-completion)

1. **Rotate the shared secrets.** The OpenAI API key and the DB password were pasted in chat and the key
   is stored in `.env` (gitignored, never committed). Good hygiene: rotate both — reset the DB password in
   the Supabase dashboard and update `DATABASE_URL`; issue a fresh OpenAI key and update `OPENAI_API_KEY`.
2. **Vercel deploy?** Artifacts are ready (`vercel.json`, `api/kb.ts`, `api/sync.ts`). I did **not** deploy —
   it needs your Vercel project + env vars (`DATABASE_URL`, `OPENAI_API_KEY`, `CRON_SECRET`) and is an
   outward-facing action. Note the cron only reconciles records in the deployed commit (see README), so the
   post-batch hook (`npm run load`) is the real sync path for the living corpus. Want me to deploy?
3. **HNSW at scale.** At 638 chunks the planner uses an exact scan (faster than the index at this size;
   recall 1.00). No action now; when the corpus is much larger, pin `hnsw.ef_search` / force the index in
   `semanticSearch`. Flagged so it isn't a silent latency regression later.
4. **Canon calibration.** `canon/design-canon-seed.json` says the principles/exemplars "need one pass from
   Michael" to match how you actually judge a sign. That's your content pass — out of scope for this surface,
   but the loader will pick up edits/new canon files automatically on the next `load`.
5. **Embedding model** is `text-embedding-3-large` (3072). Changing it = update `EMBEDDING_MODEL`/`EMBEDDING_DIM`,
   adjust the `halfvec(N)` migration, and re-run `load:rebuild` (re-embeds all; ~$0.01).

## Run it

```bash
npm install
npm run check          # connectivity + gate
npm run load           # incremental sync (structured + embeddings), self-checks invariants
npm test               # 31 tests: Phase 1–5 acceptance
npm run eval           # retrieval regression gate
npm run verify:index   # standing integrity tripwires
```

Costs: Supabase $10/mo; a full re-embed is ~$0.012 (incremental is near-zero — only changed chunks).
