import 'dotenv/config';
import path from 'node:path';

const root = process.cwd();
const resolve = (p: string): string => (path.isAbsolute(p) ? p : path.join(root, p));

export const config = {
  projectRef: process.env.SUPABASE_PROJECT_REF ?? '',
  supabaseUrl: process.env.SUPABASE_URL ?? '',
  databaseUrl: process.env.DATABASE_URL ?? '',

  // Phase 2 placeholders — not used by the Phase 1 loader.
  embeddingModel: process.env.EMBEDDING_MODEL ?? 'text-embedding-3-small',
  embeddingDim: Number(process.env.EMBEDDING_DIM ?? '1536'),

  recordsDir: resolve(process.env.RECORDS_DIR ?? './records'),
  referenceFile: resolve(process.env.REFERENCE_FILE ?? './reference/manufacturer-reference.json'),
  canonDir: resolve(process.env.CANON_DIR ?? './canon'),
  schemaPath: resolve(process.env.SCHEMA_PATH ?? './sign-record.schema.json'),
};

export function requireDatabaseUrl(): string {
  if (!config.databaseUrl) {
    throw new Error('DATABASE_URL is not set. Copy .env.example to .env and fill it in.');
  }
  return config.databaseUrl;
}
