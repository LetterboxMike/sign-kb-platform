import { config, requireOpenAIKey } from './config';
import { search, type SearchHit } from './api';

/**
 * The chat agent: retrieval over the KB through one capable model (gpt-5.4 by default). It pulls
 * the most relevant records via the query API, answers in plain language, and cites the records
 * it used so the answer can be verified. Lives in the data core (not the web app) so the
 * chat-grounding eval exercises the exact same path the console does.
 *
 * Grounding guarantee surfaced here: `citations` are only ever records that were actually
 * retrieved, and any record id the model mentions that is NOT in the retrieved set is reported
 * as `fabricated` — that is the signal the eval gate asserts to be empty.
 */

const CHAT_MODEL = process.env.CHAT_MODEL ?? 'gpt-5.4';
const REC_ID_RE = /\[(rec-[a-z0-9][a-z0-9_\-]*)\]/gi;

export interface ChatMessage {
  role: 'user' | 'assistant';
  content: string;
}

export interface RetrievedRecord {
  record_id: string;
  sign_category: string | null;
  record_type: string | null;
  chunk_type: string;
  text: string;
}

export interface ChatAnswer {
  answer: string;
  /** Retrieved records the answer actually referenced — resolvable, click-through citations. */
  citations: { record_id: string; sign_category: string | null }[];
  /** The full retrieved context (for transparency / debugging). */
  retrieved: RetrievedRecord[];
  /** Record ids the model mentioned that were NOT retrieved. Must be empty (eval #2). */
  fabricated: string[];
  model: string;
}

function buildSystemPrompt(hits: SearchHit[]): string {
  const records = hits
    .map((h) => `[${h.record_id}] (${h.sign_category ?? h.record_type ?? 'record'} · ${h.chunk_type})\n${h.text}`)
    .join('\n\n');
  return [
    'You are the Sign Knowledge Base assistant for a commercial signage company.',
    'Answer the question using ONLY the knowledge records provided below. The records are real,',
    'validated entries from the KB.',
    '',
    'Rules:',
    '- Cite every record you draw on inline by its id in square brackets, e.g. [rec-pylon-multitenant-001].',
    '- Use only the record ids that appear below. Never invent a record id or a fact not present in the records.',
    '- If the records do not contain the answer, say so plainly rather than guessing.',
    '- Be concise and concrete; speak in the language of sign fabrication.',
    '',
    'KNOWLEDGE RECORDS:',
    records || '(no records retrieved)',
  ].join('\n');
}

export async function answerQuestion(
  question: string,
  opts: { k?: number; history?: ChatMessage[] } = {},
): Promise<ChatAnswer> {
  const k = opts.k ?? 8;
  const hits = await search(question, {}, k);

  const messages = [
    { role: 'system' as const, content: buildSystemPrompt(hits) },
    ...(opts.history ?? []),
    { role: 'user' as const, content: question },
  ];

  const res = await fetch('https://api.openai.com/v1/chat/completions', {
    method: 'POST',
    headers: { Authorization: `Bearer ${requireOpenAIKey()}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ model: CHAT_MODEL, messages }),
  });
  if (!res.ok) {
    throw new Error(`OpenAI chat ${res.status}: ${await res.text()}`);
  }
  const json = (await res.json()) as { choices?: { message?: { content?: string } }[] };
  const answer = json.choices?.[0]?.message?.content ?? '';

  const retrievedIds = new Set(hits.map((h) => h.record_id));
  const mentioned = [...new Set([...answer.matchAll(REC_ID_RE)].map((m) => m[1]))];
  const citedIds = mentioned.filter((id) => retrievedIds.has(id));
  const fabricated = mentioned.filter((id) => !retrievedIds.has(id));

  const citations = citedIds.map((id) => {
    const h = hits.find((x) => x.record_id === id)!;
    return { record_id: id, sign_category: h.sign_category };
  });

  return {
    answer,
    citations,
    retrieved: hits.map((h) => ({
      record_id: h.record_id,
      sign_category: h.sign_category,
      record_type: h.record_type,
      chunk_type: h.chunk_type,
      text: h.text,
    })),
    fabricated,
    model: CHAT_MODEL,
  };
}
