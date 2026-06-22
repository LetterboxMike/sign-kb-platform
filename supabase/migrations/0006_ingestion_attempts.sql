-- Phase 2 durability: retry counter so the queue auto-recovers from transient failures
-- (e.g. a flaky model/network call). The worker re-claims 'failed' jobs under a max-attempts cap.
alter table ingestion_jobs add column if not exists attempts int not null default 0;
