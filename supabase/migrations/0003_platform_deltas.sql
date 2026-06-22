-- Phase 1 platform deltas: flip the serving surface to the system-of-record write path.
-- Additive only. Adds record lifecycle status + who-touched-it provenance, plus the
-- ranker (taste_comparisons) and app-level roles (app_users) tables.
-- ingestion_jobs (Phase 2) and corrections (Phase 3) are added in their own phases.

-- live vs staged vs rejected. The query API defaults to status='live'; the review UI (Phase 2) reads 'staging'.
alter table signs add column if not exists status text not null default 'live'
  check (status in ('live','staging','rejected'));
alter table signs add column if not exists submitted_by uuid;   -- contributor (Phase 2)
alter table signs add column if not exists reviewed_by uuid;    -- approving admin (Phase 2)

create index if not exists idx_signs_status on signs(status);

-- Design-taste ranker: pairwise comparisons roll up (Elo) into signs.quality_grade.
create table if not exists taste_comparisons (
  id uuid primary key default gen_random_uuid(),
  record_a text references signs(record_id) on delete cascade,
  record_b text references signs(record_id) on delete cascade,
  winner text check (winner in ('record_a','record_b','skip')),
  judge uuid,
  created_at timestamptz default now()
);
create index if not exists idx_taste_comparisons_judge on taste_comparisons(judge);

-- App-level governance. NOT KB tenant isolation — the KB stays universal; only write/approve is gated.
create table if not exists app_users (
  id uuid primary key,                -- supabase auth user id
  email text,
  role text not null default 'viewer' check (role in ('admin','contributor','viewer')),
  created_at timestamptz default now()
);
