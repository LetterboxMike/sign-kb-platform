import { query } from './kb';

// Review-queue reads. Staging records awaiting an admin decision, joined back to the source
// drawing via the ingestion job that produced them.

export interface StagingItem {
  record_id: string;
  record_type: string | null;
  sign_category: string | null;
  sub_type: string | null;
  source_filename: string | null;
  raw: any;
}

export async function stagingItems(): Promise<StagingItem[]> {
  const r = await query<StagingItem>(
    `select s.record_id, s.record_type, s.sign_category, s.sub_type, s.raw,
       (select j.source_filename from ingestion_jobs j
        where s.record_id = any(j.candidate_record_ids) order by j.created_at desc limit 1) as source_filename
     from signs s
     where s.status = 'staging'
     order by s.record_id`,
  );
  return r.rows;
}

export interface FlaggedJob {
  id: string;
  source_filename: string | null;
  flagged: { proposed_record_id: string | null; errors: string[]; flags: string[] }[];
  created_at: string;
}

/** Ingestion jobs that produced schema-invalid candidates the reviewer must fix by hand. */
export async function flaggedJobs(): Promise<FlaggedJob[]> {
  const r = await query<FlaggedJob>(
    `select id, source_filename, flagged, created_at
     from ingestion_jobs
     where status = 'review' and jsonb_array_length(flagged) > 0
     order by created_at desc`,
  );
  return r.rows;
}

export async function sourceFilenameFor(recordId: string): Promise<string | null> {
  const r = await query<{ source_filename: string | null }>(
    `select source_filename from ingestion_jobs
     where $1 = any(candidate_record_ids) order by created_at desc limit 1`,
    [recordId],
  );
  return r.rows[0]?.source_filename ?? null;
}
