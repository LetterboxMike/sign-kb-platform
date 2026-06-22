import dotenv from 'dotenv';
import path from 'node:path';

// The data core (query API, write path) lives in ../src and reads process.env. Load the repo
// root .env so the colocated app shares the same Supabase / OpenAI config without duplicating
// secrets. (Vercel injects real env vars in production; this is the local-dev convenience.)
dotenv.config({ path: path.resolve(process.cwd(), '..', '.env') });

// The data core reads its corpus/schema paths relative to cwd. When the app runs, cwd is web/,
// so resolve them to absolute repo-root paths (the schema is read at import time by the gate).
const root = path.resolve(process.cwd(), '..');
const abs = (envVar, rel) => {
  const v = process.env[envVar];
  process.env[envVar] = v && path.isAbsolute(v) ? v : path.resolve(root, rel);
};
abs('SCHEMA_PATH', 'sign-record.schema.json');
abs('RECORDS_DIR', 'records');
abs('REFERENCE_FILE', 'reference/manufacturer-reference.json');
abs('CANON_DIR', 'canon');
abs('EXTRACTION_SKILL', 'sign-drawing-extraction-SKILL.md');
abs('EXTRACTION_CONTRACT', 'extraction-contract.md');

/** @type {import('next').NextConfig} */
const nextConfig = {
  // Allow importing the TypeScript data core from ../src (outside the app dir).
  experimental: { externalDir: true },
  // pg is a native-ish server module — never bundle it for the client/runtime.
  serverExternalPackages: ['pg'],
  // The repo root is the tracing root (the app imports ../src and reads repo-root files).
  outputFileTracingRoot: root,
  // These are read at runtime via fs (schema gate + extraction prompt). Force them into the
  // serverless bundle so they exist on Vercel (paths relative to outputFileTracingRoot).
  outputFileTracingIncludes: {
    '/**': [
      '../sign-record.schema.json',
      '../sign-drawing-extraction-SKILL.md',
      '../extraction-contract.md',
      '../reference/manufacturer-reference.json',
      '../canon/**',
    ],
  },
};

export default nextConfig;
