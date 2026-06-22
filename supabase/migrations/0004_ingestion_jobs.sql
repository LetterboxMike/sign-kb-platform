-- Phase 2: ingestion jobs. One row per uploaded drawing run through extraction.
-- eve_session_id kept (nullable) for portability; the current pipeline is a plain server-side
-- extraction (not Eve-bound), but the column lets an Eve durable workflow attach later.
create table if not exists ingestion_jobs (
  id uuid primary key default gen_random_uuid(),
  uploaded_by uuid,                       -- contributor (app_users.id); null for server/CLI ingest
  source_filename text,
  source_path text,                       -- storage key / path of the source drawing
  status text not null default 'queued'
    check (status in ('queued','extracting','review','done','failed')),
  eve_session_id text,
  candidate_record_ids text[] not null default '{}',
  flagged jsonb not null default '[]',    -- schema-invalid candidates held for the reviewer to fix
  extraction_notes text,
  error text,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);
create index if not exists idx_ingestion_jobs_status on ingestion_jobs(status);
create index if not exists idx_ingestion_jobs_uploaded_by on ingestion_jobs(uploaded_by);
