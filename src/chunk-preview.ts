import fs from 'node:fs';
import path from 'node:path';
import { config } from './config';
import { mapRecordChunks, readCanonChunks } from './chunk';

// Phase 2 dry run: shows what the loader will chunk (records + canon), with no embedding
// and no DB writes. Confirms the canon reader points at canon/ and scans every *.json there.

const recordFiles = fs.readdirSync(config.recordsDir).filter((f) => f.endsWith('.json'));
const recCounts: Record<string, number> = { summary: 0, rationale: 0, design_obs: 0 };
let recordsWithChunks = 0;
for (const f of recordFiles) {
  const rec = JSON.parse(fs.readFileSync(path.join(config.recordsDir, f), 'utf8'));
  const chunks = mapRecordChunks(rec);
  if (chunks.length) recordsWithChunks++;
  for (const c of chunks) recCounts[c.chunk_type]++;
}
const totalRec = recCounts.summary + recCounts.rationale + recCounts.design_obs;

const canonFiles = fs.existsSync(config.canonDir)
  ? fs.readdirSync(config.canonDir).filter((f) => f.endsWith('.json'))
  : [];
const canonChunks = readCanonChunks(config.canonDir);
const canonCounts: Record<string, number> = { principle: 0, exemplar: 0 };
for (const c of canonChunks) canonCounts[c.chunk_type]++;

console.log('\nChunk preview — Phase 2 dry run (no embedding, no DB)\n');
console.log(`records scanned     : ${recordFiles.length}  (${recordsWithChunks} produced >=1 chunk)`);
console.log(`  summary           : ${recCounts.summary}`);
console.log(`  rationale         : ${recCounts.rationale}`);
console.log(`  design_obs        : ${recCounts.design_obs}`);
console.log(`canon dir           : ${config.canonDir}`);
console.log(`  files (*.json)    : ${canonFiles.length} [${canonFiles.join(', ')}]`);
console.log(`  principle         : ${canonCounts.principle}`);
console.log(`  exemplar          : ${canonCounts.exemplar}`);
console.log(`\ntotal chunks        : ${totalRec + canonChunks.length}  (records ${totalRec} + canon ${canonChunks.length})`);
console.log(`embedding model     : ${config.embeddingModel}  (dim ${config.embeddingDim})`);

console.log('\nsample canon chunks:');
for (const c of [...canonChunks].slice(0, 3)) {
  console.log(`  [${c.chunk_type}] ${c.source_id}: ${c.text.slice(0, 88).replace(/\n/g, ' / ')}...`);
}
