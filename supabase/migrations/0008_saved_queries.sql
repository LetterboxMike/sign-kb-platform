-- Phase 3: saved queries. A named search/filter a user can re-run from the console.
create table if not exists saved_queries (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  kind text not null check (kind in ('search','filter')),
  q text,                               -- natural-language query (search)
  filters jsonb not null default '{}',  -- facet filters
  created_by uuid,
  created_at timestamptz default now()
);
create index if not exists idx_saved_queries_created_at on saved_queries(created_at desc);
