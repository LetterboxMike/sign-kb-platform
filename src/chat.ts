import { requireOpenAIKey } from './config';
import { search, type SearchHit } from './api';

/**
 * The chat agent: retrieval over the KB through one capable model (gpt-5.4 by default). It talks
 * like an experienced sign fabricator, narrows a broad question with quick-reply suggestions
 * instead of dumping every variant, and grounds every fact in retrieved records. Lives in the
 * data core (not the web app) so the chat-grounding eval exercises the exact same path.
 *
 * Output is structured: { reply (markdown), suggestions (quick-action chips), sources (record
 * ids used) }. Citations are the sources that were actually retrieved; any source not in the
 * retrieved set is reported as `fabricated` — the signal the eval gate asserts to be empty.
 */

const CHAT_MODEL = process.env.CHAT_MODEL ?? 'gpt-5.4';

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
  /** Conversational answer or clarifying question, in GitHub-flavored markdown. No inline ids. */
  reply: string;
  /** Quick-reply chips the user can tap — the choices or natural follow-ups being offered. */
  suggestions: string[];
  /** Retrieved records the answer drew on — resolvable, click-through citations. */
  citations: { record_id: string; sign_category: string | null }[];
  /** Full retrieved context (for the references panel / debugging). */
  retrieved: RetrievedRecord[];
  /** Record ids the model claimed to use that were NOT retrieved. Must be empty (eval #2). */
  fabricated: string[];
  model: string;
}

const SYSTEM_PROMPT = `You are the assistant for a commercial sign company's knowledge base. Talk like a friendly, experienced sign fabricator helping a colleague — warm, plain-spoken, concise. Not a spec sheet, not a robot.

You are given KNOWLEDGE RECORDS retrieved from the KB. Every fact you state must come from them.

Choose one of two moves each turn:

1. CLARIFY — if the question is broad or could mean several different things (e.g. the records cover multiple distinct styles, mountings, or approaches), do NOT dump everything. Ask ONE short, friendly clarifying question and offer a few concrete choices as suggestions, drawn from what's actually in the records (e.g. "Face-lit", "Halo-lit", "Non-illuminated"). Keep "sources" empty when you're only clarifying.

2. ANSWER — if the question is specific enough to answer well, answer it directly and conversationally. Keep it tight and focused on exactly what they asked; don't enumerate every variant. A short paragraph plus a few bullets is plenty. End with 1-3 natural follow-up suggestions (the logical next thing they'd want — e.g. after explaining the letter build, offer "How are they mounted?").

Rules:
- Facts come only from the records. If they don't cover it, say so plainly rather than guessing.
- Never invent record ids or facts.
- Do NOT put record ids in your prose. List the records you drew facts from in "sources".
- Write "reply" in GitHub-flavored markdown.

Respond with ONLY a JSON object, no prose around it:
{"reply": "...", "suggestions": ["...", "..."], "sources": ["rec-...", "..."]}`;

function buildContext(hits: SearchHit[]): string {
  if (!hits.length) return '(no records retrieved)';
  return hits
    .map((h) => `[${h.record_id}] (${h.sign_category ?? h.record_type ?? 'record'} · ${h.chunk_type})\n${h.text}`)
    .join('\n\n');
}

/** Tolerant JSON parse: handles a clean object, a ```json fenced block, or falls back to
 *  treating the whole string as the reply so the chat never hard-fails on a formatting hiccup. */
function parseModelJson(content: string): { reply: string; suggestions: string[]; sources: string[] } {
  const tryParse = (s: string) => {
    try {
      const o = JSON.parse(s);
      if (o && typeof o === 'object' && typeof o.reply === 'string') return o;
    } catch {
      /* fall through */
    }
    return null;
  };
  const fenced = content.match(/```(?:json)?\s*([\s\S]*?)```/);
  const candidate = tryParse(content.trim()) ?? (fenced ? tryParse(fenced[1].trim()) : null);
  const o = candidate ?? { reply: content.trim(), suggestions: [], sources: [] };
  return {
    reply: typeof o.reply === 'string' ? o.reply : content.trim(),
    suggestions: Array.isArray(o.suggestions) ? o.suggestions.filter((s: unknown) => typeof s === 'string').slice(0, 5) : [],
    sources: Array.isArray(o.sources) ? o.sources.filter((s: unknown) => typeof s === 'string') : [],
  };
}

export async function answerQuestion(question: string, opts: { k?: number; history?: ChatMessage[] } = {}): Promise<ChatAnswer> {
  const k = opts.k ?? 8;
  const history = opts.history ?? [];

  // Give retrieval conversational context: a tapped chip like "Face-lit" is meaningless alone, so
  // fold in the most recent prior user turn when building the search query.
  const priorUser = [...history].reverse().find((m) => m.role === 'user')?.content;
  const searchQuery = priorUser ? `${priorUser} ${question}` : question;
  const hits = await search(searchQuery, {}, k);

  const messages = [
    { role: 'system' as const, content: `${SYSTEM_PROMPT}\n\nKNOWLEDGE RECORDS:\n${buildContext(hits)}` },
    ...history,
    { role: 'user' as const, content: question },
  ];

  const res = await fetch('https://api.openai.com/v1/chat/completions', {
    method: 'POST',
    headers: { Authorization: `Bearer ${requireOpenAIKey()}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ model: CHAT_MODEL, messages, response_format: { type: 'json_object' } }),
  });
  if (!res.ok) throw new Error(`OpenAI chat ${res.status}: ${await res.text()}`);
  const json = (await res.json()) as { choices?: { message?: { content?: string } }[] };
  const { reply, suggestions, sources } = parseModelJson(json.choices?.[0]?.message?.content ?? '');

  const retrievedIds = new Set(hits.map((h) => h.record_id));
  const uniqueSources = [...new Set(sources)];
  const citations = uniqueSources
    .filter((id) => retrievedIds.has(id))
    .map((id) => ({ record_id: id, sign_category: hits.find((h) => h.record_id === id)!.sign_category }));
  const fabricated = uniqueSources.filter((id) => !retrievedIds.has(id));

  return {
    reply,
    suggestions,
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
