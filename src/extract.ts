import fs from 'node:fs';
import path from 'node:path';
import { config, requireOpenAIKey } from './config';
import { validateRecord } from './validate';
import schema from '../sign-record.schema.json';
import { EXTRACTION_SKILL, EXTRACTION_CONTRACT } from './extraction-text';

/**
 * The ingestion extraction engine. Turns a sign drawing (PDF) into candidate KB records by
 * running the ported extraction skill + contract + schema against a vision-capable model
 * (gpt-5.4 by default), then puts every candidate through the write-time schema gate.
 *
 * Deliberately framework-agnostic: it is a plain server-side function, not bound to Eve. The
 * build plan calls for keeping the skill/contract/schema portable; this is that portable core,
 * and it can later be wrapped by an Eve durable workflow / multi-agent orchestration (AI Gateway
 * roster) without changing the contract. gpt-5.4 reads the PDF directly (no page rasterization).
 */

export interface ExtractionCandidate {
  record: any;
  valid: boolean; // passed the schema gate
  errors: string[]; // gate errors when invalid
  flags: string[]; // soft flags: proposed_new_term, extraction_meta ambiguity, possible PII
}

export interface ExtractionResult {
  candidates: ExtractionCandidate[];
  extraction_notes: string;
  model: string;
}

let cachedPrompt: string | null = null;

function buildSystemPrompt(): string {
  if (cachedPrompt) return cachedPrompt;
  const skill = EXTRACTION_SKILL;
  const contract = EXTRACTION_CONTRACT;
  const schemaText = JSON.stringify(schema, null, 2);
  cachedPrompt = [
    'You are the sign-drawing extraction agent for a commercial signage knowledge base. You turn a',
    'sign drawing (PDF) into one or more validated knowledge-base records. Execute the SKILL using',
    'the CONTRACT vocabulary and rules, producing records that conform exactly to the SCHEMA.',
    '',
    'Hard requirements:',
    '- Read the whole drawing — construction notes, finish/color schedules, dimensions, elevations.',
    '- Emit ONE record per distinct sign type (rule R2): collapse trivial variants (level letters,',
    '  donor copy, room numbers) into a single record via program_model / message_schedule. Never mint',
    '  near-duplicate records.',
    '- Apply the ruleset R1–R7. R1 (PII) is HARD: strip vendor/sign-company identity, end-client name,',
    '  human names, contacts, addresses, and donor/personal copy. Keep industry vertical, technical spec,',
    '  and copy STRUCTURE only; set copy_content: excluded_pii where copy appears.',
    '- Tag provenance (drawing | inferred | researched | opinion) on field groups that carry it.',
    '- Use only the controlled-vocabulary enum values; for a genuinely novel value set the field to',
    '  "proposed_new_term" and explain it in extraction_meta — never silently invent a synonym.',
    '- Leave design_assessment.quality_grade null with grade_provenance "ungraded_pending_review".',
    '- Set schema_version to "1.5" and record_type to the correct discriminator.',
    '- Each record MUST validate against the SCHEMA (discriminated on record_type).',
    '',
    'Classification decisions (apply carefully — these are the fields that matter most):',
    '- record_type: choose flat_graphic for a printed graphic applied to a surface or a flat printed',
    '  panel (vinyl, dibond/ACM print, interpretive/wayfinding panel) that has NO fabricated multi-',
    '  component structure and no illumination. Choose fabricated_sign only when there is a built',
    '  structure of components (cabinet, channel letters, monument, blade, dimensional letters, etc.).',
    '  vehicle_wrap only for graphics applied to a vehicle.',
    '- doc_type: read it from the drawing\'s title block / labeling. "shop" = construction details with',
    '  dimensions and material callouts; "design_intent"/"design_conceptual" = appearance/intent without',
    '  full fabrication spec; "permit"/"as_built"/"survey" as labeled. Do not default to conceptual when',
    '  the sheet carries shop-level construction detail.',
    '- fabrication_family: pick the SINGLE dominant construction archetype. A built box/can is "cabinet";',
    '  internally/halo-lit letters are "channel_letter"; reserve "composite_structure" for genuinely',
    '  multi-system monuments/features. Secondary constructions go in structure[], not the family.',
    '- illuminated/illumination_method: only mark illuminated true when the drawing shows a lighting',
    '  system. External uplight/downlight fixtures count; ambient site lighting does not.',
    '- Prefer existing enum values; reserve proposed_new_term for genuinely novel cases.',
    '',
    'Respond with ONLY a JSON object, no prose around it:',
    '{"records": [ <record>, ... ], "extraction_notes": "<brief notes on ambiguities/flags>"}',
    '',
    '===== SKILL =====',
    skill,
    '',
    '===== CONTRACT =====',
    contract,
    '',
    '===== SCHEMA (sign-record.schema.json) =====',
    schemaText,
  ].join('\n');
  return cachedPrompt;
}

function parseJson(content: string): { records: any[]; extraction_notes: string } {
  const tryParse = (s: string) => {
    try {
      const o = JSON.parse(s);
      return o && typeof o === 'object' ? o : null;
    } catch {
      return null;
    }
  };
  const fenced = content.match(/```(?:json)?\s*([\s\S]*?)```/);
  const o = tryParse(content.trim()) ?? (fenced ? tryParse(fenced[1].trim()) : null) ?? {};
  return {
    records: Array.isArray(o.records) ? o.records : Array.isArray(o) ? o : [],
    extraction_notes: typeof o.extraction_notes === 'string' ? o.extraction_notes : '',
  };
}

// Cheap PII tripwire on the produced record (the model is told to strip; this flags leaks for review).
const EMAIL_RE = /[a-z0-9._%+-]+@[a-z0-9.-]+\.[a-z]{2,}/i;
const PHONE_RE = /\b\(?\d{3}\)?[-.\s]\d{3}[-.\s]\d{4}\b/;
function piiFlags(record: any): string[] {
  const blob = JSON.stringify(record);
  const flags: string[] = [];
  if (EMAIL_RE.test(blob)) flags.push('possible email in record');
  if (PHONE_RE.test(blob)) flags.push('possible phone number in record');
  return flags;
}

function softFlags(record: any): string[] {
  const blob = JSON.stringify(record);
  const flags: string[] = [];
  if (blob.includes('proposed_new_term')) flags.push('proposed_new_term — needs vocab decision');
  const em = record?.extraction_meta;
  if (em && (em.flags || em.ambiguities || em.conflicts)) flags.push('extraction_meta carries ambiguity/conflict flags');
  flags.push(...piiFlags(record));
  return flags;
}

/** Derive a content-type from the filename so the model receives the right kind of input.
 *  Browsers sometimes drop file.type, but the extension is reliable for our accepted formats. */
function contentTypeFor(filename: string): string {
  const ext = filename.toLowerCase().split('.').pop() ?? '';
  const map: Record<string, string> = {
    pdf: 'application/pdf',
    png: 'image/png',
    jpg: 'image/jpeg',
    jpeg: 'image/jpeg',
    webp: 'image/webp',
    tif: 'image/tiff',
    tiff: 'image/tiff',
  };
  return map[ext] ?? 'application/pdf';
}

// How long to wait on the OpenAI call before aborting with a clear error (default 280s, just under
// the 300s function budget). A large/complex drawing that exceeds this fails loudly instead of
// being silently killed by the platform and blind-retried.
const EXTRACTION_TIMEOUT_MS = Number(process.env.EXTRACTION_TIMEOUT_MS ?? '280000');

/** Upload a drawing to the OpenAI Files API and return its file_id. PDFs are referenced by
 *  file_id (not inlined as base64) so a large drawing never inflates the JSON request body past
 *  the API limit — the historical cause of large uploads "uploading fine but never ingesting". */
async function uploadDrawing(bytes: Buffer, filename: string, contentType: string): Promise<string> {
  const form = new FormData();
  form.append('purpose', 'user_data');
  // Copy into a standalone Uint8Array so the Blob part types cleanly under both Node and DOM libs.
  form.append('file', new Blob([new Uint8Array(bytes)], { type: contentType }), filename);
  const res = await fetch('https://api.openai.com/v1/files', {
    method: 'POST',
    headers: { Authorization: `Bearer ${requireOpenAIKey()}` },
    body: form,
  });
  if (!res.ok) throw new Error(`OpenAI file upload ${res.status}: ${await res.text()}`);
  const json = (await res.json()) as { id?: string };
  if (!json.id) throw new Error('OpenAI file upload returned no id');
  return json.id;
}

/** Best-effort cleanup so uploaded drawings don't accumulate in the OpenAI account. */
async function deleteDrawing(fileId: string): Promise<void> {
  try {
    await fetch(`https://api.openai.com/v1/files/${fileId}`, {
      method: 'DELETE',
      headers: { Authorization: `Bearer ${requireOpenAIKey()}` },
    });
  } catch {
    /* non-fatal */
  }
}

export async function extractFromPdf(pdf: Buffer, filename: string): Promise<ExtractionResult> {
  const contentType = contentTypeFor(filename);
  const isImage = contentType.startsWith('image/');

  // Images are small enough to inline; PDFs go through the Files API (file_id reference).
  let fileId: string | null = null;
  let filePart: any;
  if (isImage) {
    filePart = { type: 'image_url', image_url: { url: `data:${contentType};base64,${pdf.toString('base64')}` } };
  } else {
    fileId = await uploadDrawing(pdf, filename, contentType);
    filePart = { type: 'file', file: { file_id: fileId } };
  }

  const body = {
    model: config.extractionModel,
    messages: [
      { role: 'system', content: buildSystemPrompt() },
      {
        role: 'user',
        content: [
          { type: 'text', text: `Extract knowledge-base records from this sign drawing ("${filename}"). Output JSON only.` },
          filePart,
        ],
      },
    ],
    response_format: { type: 'json_object' },
  };

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), EXTRACTION_TIMEOUT_MS);
  try {
    const res = await fetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      headers: { Authorization: `Bearer ${requireOpenAIKey()}`, 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
      signal: controller.signal,
    });
    if (!res.ok) throw new Error(`OpenAI extraction ${res.status}: ${(await res.text()).slice(0, 1000)}`);
    const json = (await res.json()) as { choices?: { message?: { content?: string } }[] };
    const { records, extraction_notes } = parseJson(json.choices?.[0]?.message?.content ?? '{}');

    const candidates: ExtractionCandidate[] = records.map((record) => {
      const { valid, errors } = validateRecord(record);
      return { record, valid, errors, flags: softFlags(record) };
    });

    return { candidates, extraction_notes, model: config.extractionModel };
  } catch (e) {
    if (e instanceof Error && e.name === 'AbortError') {
      throw new Error(
        `extraction timed out after ${Math.round(EXTRACTION_TIMEOUT_MS / 1000)}s — the drawing is likely too large or complex. Try uploading a single sheet.`,
      );
    }
    throw e;
  } finally {
    clearTimeout(timer);
    if (fileId) await deleteDrawing(fileId);
  }
}

export async function extractFromFile(filePath: string): Promise<ExtractionResult> {
  return extractFromPdf(fs.readFileSync(filePath), path.basename(filePath));
}
