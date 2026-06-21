import 'dotenv/config';
import path from 'node:path';

const root = process.cwd();
const resolve = (p: string): string => (path.isAbsolute(p) ? p : path.join(root, p));

export const config = {
  projectRef: process.env.SUPABASE_PROJECT_REF ?? '',
  supabaseUrl: process.env.SUPABASE_URL ?? '',
  databaseUrl: process.env.DATABASE_URL ?? '',

  // Phase 2 — semantic retrieval.
  embeddingModel: process.env.EMBEDDING_MODEL ?? 'text-embedding-3-large',
  embeddingDim: Number(process.env.EMBEDDING_DIM ?? '3072'),
  openaiApiKey: process.env.OPENAI_API_KEY ?? '',

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

export function requireOpenAIKey(): string {
  if (!config.openaiApiKey) {
    throw new Error('OPENAI_API_KEY is not set. Add it to .env (needed for Phase 2 embeddings).');
  }
  return config.openaiApiKey;
}
