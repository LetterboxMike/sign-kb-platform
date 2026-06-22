import fs from 'node:fs';
import path from 'node:path';
import { config } from './config';
import { query, closePool } from './db';

/**
 * JSON export — the portability layer. Under the system-of-record model the DB is the source
 * and this writes it back out to inspectable, versionable, rebuildable JSON: one file per
 * record plus a full-corpus file and a manifest. This is what you hand to Bryant, commit for
 * versioning, and keep as backup. `load(... { rebuild: true })` over an export reproduces the
 * corpus (round-trip), preserving the property the flat-file pipeline had.
 */

export interface ExportOptions {
  outDir?: string; // default ./export
  includeNonLive?: boolean; // default false — export only status='live' (the live corpus)
  now?: Date;
}

export interface ManifestRecord {
  record_id: string;
  content_hash: string;
  status: string;
  schema_version: string | null;
}

export interface ExportManifest {
  exported_at: string;
  count: number;
  embedding_model: string;
  schema_versions: Record<string, number>;
  records: ManifestRecord[];
}

export async function exportCorpus(opts: ExportOptions = {}): Promise<ExportManifest> {
  const outDir = opts.outDir ?? path.join(process.cwd(), 'export');
  const includeNonLive = opts.includeNonLive ?? false;
  const now = opts.now ?? new Date();
  const where = includeNonLive ? '' : "where status = 'live'";

  const res = await query<{
    record_id: string;
    raw: any;
    content_hash: string;
    status: string;
    schema_version: string | null;
  }>(`select record_id, raw, content_hash, status, schema_version from signs ${where} order by record_id`);

  const recordsDir = path.join(outDir, 'records');
  fs.mkdirSync(recordsDir, { recursive: true });
  // Clean stale per-record files so the export dir exactly reflects the DB snapshot.
  for (const f of fs.readdirSync(recordsDir)) {
    if (f.endsWith('.json')) fs.rmSync(path.join(recordsDir, f));
  }

  const schemaVersions: Record<string, number> = {};
  const manifestRecords: ManifestRecord[] = [];
  const corpus: any[] = [];
  for (const r of res.rows) {
    fs.writeFileSync(path.join(recordsDir, `${r.record_id}.json`), JSON.stringify(r.raw, null, 2) + '\n');
    corpus.push(r.raw);
    const sv = r.schema_version ?? 'unknown';
    schemaVersions[sv] = (schemaVersions[sv] ?? 0) + 1;
    manifestRecords.push({
      record_id: r.record_id,
      content_hash: r.content_hash,
      status: r.status,
      schema_version: r.schema_version,
    });
  }

  fs.writeFileSync(path.join(outDir, 'corpus.json'), JSON.stringify(corpus, null, 2) + '\n');
  const manifest: ExportManifest = {
    exported_at: now.toISOString(),
    count: res.rows.length,
    embedding_model: config.embeddingModel,
    schema_versions: schemaVersions,
    records: manifestRecords,
  };
  fs.writeFileSync(path.join(outDir, 'manifest.json'), JSON.stringify(manifest, null, 2) + '\n');
  return manifest;
}

const invokedDirectly = process.argv[1] && import.meta.url.endsWith(path.basename(process.argv[1]));
if (invokedDirectly) {
  const includeNonLive = process.argv.includes('--all');
  const outArg = process.argv.find((a) => a.startsWith('--out='));
  const outDir = outArg ? outArg.slice('--out='.length) : undefined;
  exportCorpus({ includeNonLive, outDir })
    .then(async (m) => {
      console.log(`\nKB export — ${m.count} records (${includeNonLive ? 'all statuses' : 'live only'})`);
      console.log(`  exported_at     : ${m.exported_at}`);
      console.log(`  schema_versions : ${JSON.stringify(m.schema_versions)}`);
      console.log(`  out dir         : ${outDir ?? './export'}`);
      await closePool();
      process.exit(0);
    })
    .catch(async (e) => {
      console.error(e);
      await closePool();
      process.exit(1);
    });
}
