import fs from 'node:fs';
import path from 'node:path';
import { config } from './config';
import { query, closePool } from './db';

/**
 * JSON export — the portability layer. Under the system-of-record model the DB is the source and
 * this writes it back out to inspectable, versionable, rebuildable JSON: one file per record, a
 * full-corpus file, the reference layer, and a manifest. `buildExportBundle` returns the same
 * data in memory so the web app can stream it as a download without touching the filesystem.
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
  reference_count: number;
  embedding_model: string;
  schema_versions: Record<string, number>;
  records: ManifestRecord[];
}

export interface ExportBundle {
  records: any[]; // signs.raw
  reference: any[]; // reference rows
  manifest: ExportManifest;
}

/** Build the full export in memory (records + reference layer + manifest). */
export async function buildExportBundle(opts: { includeNonLive?: boolean; now?: Date } = {}): Promise<ExportBundle> {
  const includeNonLive = opts.includeNonLive ?? false;
  const now = opts.now ?? new Date();
  const where = includeNonLive ? '' : "where status = 'live'";

  const signs = await query<{ record_id: string; raw: any; content_hash: string; status: string; schema_version: string | null }>(
    `select record_id, raw, content_hash, status, schema_version from signs ${where} order by record_id`,
  );
  const ref = await query<any>(
    `select normalized_id, company, category, product, knowledge, optical_behavior, depth from reference order by normalized_id`,
  );

  const schemaVersions: Record<string, number> = {};
  const manifestRecords: ManifestRecord[] = [];
  const records: any[] = [];
  for (const r of signs.rows) {
    records.push(r.raw);
    const sv = r.schema_version ?? 'unknown';
    schemaVersions[sv] = (schemaVersions[sv] ?? 0) + 1;
    manifestRecords.push({ record_id: r.record_id, content_hash: r.content_hash, status: r.status, schema_version: r.schema_version });
  }

  const manifest: ExportManifest = {
    exported_at: now.toISOString(),
    count: signs.rows.length,
    reference_count: ref.rows.length,
    embedding_model: config.embeddingModel,
    schema_versions: schemaVersions,
    records: manifestRecords,
  };
  return { records, reference: ref.rows, manifest };
}

export async function exportCorpus(opts: ExportOptions = {}): Promise<ExportManifest> {
  const outDir = opts.outDir ?? path.join(process.cwd(), 'export');
  const bundle = await buildExportBundle(opts);

  const recordsDir = path.join(outDir, 'records');
  fs.mkdirSync(recordsDir, { recursive: true });
  for (const f of fs.readdirSync(recordsDir)) {
    if (f.endsWith('.json')) fs.rmSync(path.join(recordsDir, f));
  }
  for (const raw of bundle.records) {
    fs.writeFileSync(path.join(recordsDir, `${raw.record_id}.json`), JSON.stringify(raw, null, 2) + '\n');
  }
  fs.writeFileSync(path.join(outDir, 'corpus.json'), JSON.stringify(bundle.records, null, 2) + '\n');
  fs.writeFileSync(path.join(outDir, 'reference.json'), JSON.stringify({ entries: bundle.reference }, null, 2) + '\n');
  fs.writeFileSync(path.join(outDir, 'manifest.json'), JSON.stringify(bundle.manifest, null, 2) + '\n');
  return bundle.manifest;
}

const invokedDirectly = process.argv[1] && import.meta.url.endsWith(path.basename(process.argv[1]));
if (invokedDirectly) {
  const includeNonLive = process.argv.includes('--all');
  const outArg = process.argv.find((a) => a.startsWith('--out='));
  const outDir = outArg ? outArg.slice('--out='.length) : undefined;
  exportCorpus({ includeNonLive, outDir })
    .then(async (m) => {
      console.log(`\nKB export — ${m.count} records, ${m.reference_count} reference (${includeNonLive ? 'all statuses' : 'live only'})`);
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
