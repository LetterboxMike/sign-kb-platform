-- Phase 2 security: lock the data-core + platform tables to deny-by-default RLS.
--
-- WHY THIS IS DEFENSE-IN-DEPTH, NOT THE APP'S ACCESS GATE.
-- The app reaches these tables exclusively server-side through `pg` over DATABASE_URL (see
-- web/lib/kb.ts -> src/db.ts) as the Supabase `postgres` role, which has BYPASSRLS. So RLS here
-- does NOT change app behavior. The real authorization gate is the server-side role check in
-- web/lib/auth.ts (requireRole/requireAdmin/requireContributor), applied to every write-path
-- server action and route handler.
--
-- What RLS buys us: deny-by-default if the tables are ever reached another way — namely the
-- Supabase anon/authenticated keys via PostgREST. The anon key ships in the browser (it's used for
-- auth), so per the CLAUDE.md guardrail it must NOT carry table access.
--
-- This migration also RECONCILES PRODUCTION DRIFT: the live DB had three permissive policies that
-- were never captured in a migration and that contradict that guardrail —
--   * signs_read         (anon, authenticated) SELECT USING (true)  -> exposed ALL signs incl. staging/rejected
--   * reference_read      (anon, authenticated) SELECT USING (true)  -> exposed the whole reference layer
--   * ingestion_jobs_app  (authenticated)       ALL    USING (true)  -> full read/write on the ingest queue
-- The app never used them (it reads via the postgres connection), so dropping them tightens the KB
-- without changing app behavior. RLS is ENABLED, not FORCED: forcing would subject the owner
-- connection too and break the app.

-- 1) Enable RLS on every table (idempotent; a no-op where already enabled).
alter table signs              enable row level security;
alter table reference          enable row level security;
alter table sign_components    enable row level security;
alter table sign_materials     enable row level security;
alter table kb_chunks          enable row level security;
alter table taste_comparisons  enable row level security;
alter table app_users          enable row level security;
alter table ingestion_jobs     enable row level security;
alter table corrections        enable row level security;
alter table saved_queries      enable row level security;

-- 2) Drop the drifted permissive policies so anon/authenticated get zero access via PostgREST.
drop policy if exists signs_read        on signs;
drop policy if exists reference_read    on reference;
drop policy if exists ingestion_jobs_app on ingestion_jobs;

-- No policies remain on these tables on purpose: deny-by-default for every non-BYPASSRLS role
-- (anon, authenticated). The owner connection (postgres) and service_role bypass RLS and are
-- unaffected. If a future surface needs direct PostgREST reads (e.g. a public read-only API on
-- live records), add a NARROW policy in its own migration, e.g.:
--   create policy signs_public_live on signs for select to anon using (status = 'live');
-- never a blanket USING (true) policy that re-opens the table.
