import fs from 'node:fs';
import path from 'node:path';
import { config } from './config';
import { query, closePool } from './db';
import { validateRecord } from './validate';

// Phase 0 acceptance: connects to Supabase, confirms the vector extension is present,
// confirms config resolves, and runs the gate against one sample record.
async function main(): Promise<void> {
  console.log('Sign KB serving surface — Phase 0 check\n');

  console.log('Config:');
  console.log(`  project ref   : ${config.projectRef || '(unset)'}`);
  console.log(`  supabase url  : ${config.supabaseUrl || '(unset)'}`);
  console.log(`  records dir   : ${config.recordsDir}`);
  console.log(`  reference     : ${config.referenceFile}`);
  console.log(`  schema        : ${config.schemaPath}`);
  console.log(`  embedding dim : ${config.embeddingDim} (Phase 2)\n`);

  const ping = await query<{ now: string }>('select now()::text as now');
  console.log(`DB connection : OK (server time ${ping.rows[0].now})`);

  const ext = await query<{ extversion: string }>(
    "select extversion from pg_extension where extname = 'vector'",
  );
  console.log(
    ext.rows.length
      ? `vector ext    : present (v${ext.rows[0].extversion})`
      : 'vector ext    : MISSING',
  );

  const sampleFile = fs
    .readdirSync(config.recordsDir)
    .filter((f) => f.endsWith('.json'))
    .sort()[0];
  const sample = JSON.parse(fs.readFileSync(path.join(config.recordsDir, sampleFile), 'utf8'));
  const result = validateRecord(sample);
  console.log(
    `gate sample   : ${sampleFile} → ${result.valid ? 'VALID' : 'INVALID'}${
      result.valid ? '' : '\n  ' + result.errors.join('\n  ')
    }`,
  );

  await closePool();
}

main().catch(async (e) => {
  console.error(e);
  await closePool();
  process.exit(1);
});
