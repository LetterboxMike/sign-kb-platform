import path from 'node:path';
import { ingestFile } from './ingest';
import { closePool } from './db';

/**
 * Ingest a drawing into staging: `npm run ingest -- "<path-to-drawing.pdf>"`.
 * Writes schema-valid candidates to status='staging' (never live) and records an ingestion_job.
 * Promotion to live happens through the review queue on admin approval.
 */
async function main() {
  const file = process.argv.slice(2).find((a) => !a.startsWith('-'));
  if (!file) {
    console.error('usage: npm run ingest -- "<path-to-drawing.pdf>"');
    process.exit(2);
  }
  console.log(`Ingesting ${path.basename(file)} …\n`);
  const r = await ingestFile(file);
  console.log(`job ${r.jobId} → ${r.status}`);
  console.log(`staged: ${r.staged}  flagged: ${r.flagged.length}`);
  for (const id of r.candidateRecordIds) console.log(`  staged: ${id}`);
  for (const f of r.flagged) console.log(`  flagged: ${f.proposed_record_id ?? '(no id)'} — ${f.errors.slice(0, 2).join('; ')}`);
  if (r.extractionNotes) console.log(`notes: ${r.extractionNotes}`);
  if (r.error) console.log(`error: ${r.error}`);
  await closePool();
  process.exit(0);
}

main().catch(async (e) => {
  console.error(e);
  await closePool();
  process.exit(1);
});
