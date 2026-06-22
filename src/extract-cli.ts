import path from 'node:path';
import { extractFromFile } from './extract';

/**
 * Ad-hoc extraction: `npm run extract -- "<path-to-drawing.pdf>"`. Prints the candidate records
 * and their gate status. Does NOT write to the DB — that's the review/approval flow's job.
 */
async function main() {
  const file = process.argv.slice(2).find((a) => !a.startsWith('-'));
  if (!file) {
    console.error('usage: npm run extract -- "<path-to-drawing.pdf>"');
    process.exit(2);
  }
  console.log(`Extracting ${path.basename(file)} …\n`);
  const { candidates, extraction_notes, model } = await extractFromFile(file);
  console.log(`model: ${model}  candidates: ${candidates.length}`);
  if (extraction_notes) console.log(`notes: ${extraction_notes}\n`);
  candidates.forEach((c, i) => {
    const cls = c.record?.classification ?? {};
    console.log(`[${i + 1}] ${c.record?.record_id ?? '(no id)'} — ${c.record?.record_type} / ${cls.sign_category ?? cls.graphic_method ?? cls.vehicle_class ?? '?'}`);
    console.log(`    gate: ${c.valid ? 'VALID' : 'INVALID — ' + c.errors.slice(0, 3).join('; ')}`);
    if (c.flags.length) console.log(`    flags: ${c.flags.join('; ')}`);
  });
  process.exit(0);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
