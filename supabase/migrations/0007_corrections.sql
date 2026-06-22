-- Phase 3: governed self-correction. A correction proposes a change set; on approval it is
-- applied (re-validated + re-embedded), eval-gated, and committed with an audit trail + a
-- snapshot for exact one-click revert. A chat correction never writes the corpus directly.
create table if not exists corrections (
  id uuid primary key default gen_random_uuid(),
  prompt text,                                   -- the correction in plain language
  change_set jsonb not null,                     -- [{record_id, path, before, after}]
  snapshot jsonb,                                -- prior full raw per affected record (exact revert)
  eval_result jsonb,                             -- retrieval-eval pass/fail + scores at commit time
  status text not null default 'proposed'
    check (status in ('proposed','approved','rejected','reverted')),
  approved_by uuid,
  created_at timestamptz default now(),
  committed_at timestamptz,
  reverted_at timestamptz
);
create index if not exists idx_corrections_status on corrections(status);
