import { answerQuestion } from './chat';
import { getRecord } from './api';
import { closePool } from './db';

/**
 * Chat-grounding eval (build-plan eval #2): the chat agent's answers must cite only retrieved
 * records, every citation must resolve, and there must be zero fabricated record ids. Runs the
 * real retrieval + model path (src/chat.ts) — the same one the console uses.
 *
 * Gate: PASS requires zero fabricated ids, zero unresolved citations, and grounding actually
 * happening (at least half the questions produce >=1 resolvable citation).
 */

// Specific questions, so the agent answers directly and grounds in records (rather than asking a
// clarifying question, which is the correct behavior for broad prompts but cites nothing).
const QUESTIONS = [
  'How is a face-lit channel letter constructed — the face, returns, and trim cap?',
  'How is a halo-illuminated reverse channel letter built and lit?',
  'How is a board-formed concrete monument sign base constructed?',
  'What materials and method are used for an ADA tactile and braille room ID plaque?',
  'What is push-through acrylic and how is it fabricated into a sign face?',
  'How is a sign mounted to an existing pole using a band clamp?',
];

export interface ChatEvalReport {
  metrics: {
    questions: number;
    questionsWithCitations: number;
    totalCitations: number;
    fabricated: number;
    unresolved: number;
  };
  failures: string[];
  perQuestion: { q: string; cites: string[]; fabricated: number }[];
}

/** Run the chat-grounding eval (no process exit). Reusable by the correction gate and the
 *  scheduled eval route. */
export async function runChatEval(): Promise<ChatEvalReport> {
  let totalCitations = 0;
  let fabricated = 0;
  let unresolved = 0;
  let questionsWithCitations = 0;
  const failures: string[] = [];
  const perQuestion: ChatEvalReport['perQuestion'] = [];

  for (const q of QUESTIONS) {
    const res = await answerQuestion(q, {});
    if (res.fabricated.length) {
      fabricated += res.fabricated.length;
      failures.push(`[${q}] fabricated ids: ${res.fabricated.join(', ')}`);
    }
    if (res.citations.length) questionsWithCitations++;
    for (const c of res.citations) {
      totalCitations++;
      const rec = await getRecord(c.record_id);
      if (!rec) {
        unresolved++;
        failures.push(`[${q}] unresolved citation: ${c.record_id}`);
      }
    }
    perQuestion.push({ q, cites: res.citations.map((c) => c.record_id), fabricated: res.fabricated.length });
  }

  return {
    metrics: { questions: QUESTIONS.length, questionsWithCitations, totalCitations, fabricated, unresolved },
    failures,
    perQuestion,
  };
}

/** Gate: zero fabricated ids, zero unresolved citations, and grounding actually happening
 *  (at least half the questions produce >=1 resolvable citation). */
export function chatEvalPasses(r: ChatEvalReport): { ok: boolean; reasons: string[] } {
  const reasons: string[] = [];
  if (r.metrics.fabricated > 0) reasons.push(`${r.metrics.fabricated} fabricated id(s)`);
  if (r.metrics.unresolved > 0) reasons.push(`${r.metrics.unresolved} unresolved citation(s)`);
  const grounded = r.metrics.questionsWithCitations >= Math.ceil(r.metrics.questions / 2);
  if (!grounded) reasons.push(`grounding ${r.metrics.questionsWithCitations}/${r.metrics.questions} < half`);
  return { ok: reasons.length === 0, reasons };
}

const invokedDirectly = process.argv[1] && process.argv[1].endsWith('eval-chat.ts');
if (invokedDirectly) {
  runChatEval()
    .then((r) => {
      for (const pq of r.perQuestion) {
        console.log(`Q: ${pq.q}`);
        console.log(`   cites: ${pq.cites.join(', ') || '(none)'}  fabricated: ${pq.fabricated}`);
      }
      const v = chatEvalPasses(r);
      console.log('\n— Chat grounding eval —');
      console.log(`  model              : ${process.env.CHAT_MODEL ?? 'gpt-5.4'}`);
      console.log(`  questions          : ${r.metrics.questions}`);
      console.log(`  with >=1 citation  : ${r.metrics.questionsWithCitations}`);
      console.log(`  total citations    : ${r.metrics.totalCitations}`);
      console.log(`  fabricated ids     : ${r.metrics.fabricated}`);
      console.log(`  unresolved cites   : ${r.metrics.unresolved}`);
      console.log(v.ok ? '\nPASS — zero fabricated, all citations resolve, grounding present' : `\nFAIL: ${v.reasons.join('; ')}`);
      for (const f of r.failures) console.log(`  ${f}`);
      return closePool().then(() => process.exit(v.ok ? 0 : 1));
    })
    .catch(async (e) => {
      console.error(e);
      await closePool();
      process.exit(1);
    });
}
