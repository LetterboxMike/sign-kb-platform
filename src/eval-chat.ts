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

const QUESTIONS = [
  'How is a halo-illuminated monument sign constructed?',
  'What materials are used for channel letter faces?',
  'When would you choose a pylon sign over a monument sign?',
  'How are ADA tactile and braille signs specified?',
  'What is push-through acrylic and when is it used?',
  'How can a sign be mounted to an existing pole without penetrating it?',
];

async function main() {
  let totalCitations = 0;
  let fabricated = 0;
  let unresolved = 0;
  let questionsWithCitations = 0;
  const failures: string[] = [];

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
    console.log(`Q: ${q}`);
    console.log(`   cites: ${res.citations.map((c) => c.record_id).join(', ') || '(none)'}  fabricated: ${res.fabricated.length}`);
  }

  const grounded = questionsWithCitations >= Math.ceil(QUESTIONS.length / 2);
  const pass = fabricated === 0 && unresolved === 0 && grounded;

  console.log('\n— Chat grounding eval —');
  console.log(`  model              : ${process.env.CHAT_MODEL ?? 'gpt-5.4'}`);
  console.log(`  questions          : ${QUESTIONS.length}`);
  console.log(`  with >=1 citation  : ${questionsWithCitations}`);
  console.log(`  total citations    : ${totalCitations}`);
  console.log(`  fabricated ids     : ${fabricated}`);
  console.log(`  unresolved cites   : ${unresolved}`);
  console.log(pass ? '\nPASS — zero fabricated, all citations resolve, grounding present' : '\nFAIL');
  for (const f of failures) console.log(`  ${f}`);

  await closePool();
  process.exit(pass ? 0 : 1);
}

main().catch(async (e) => {
  console.error(e);
  await closePool();
  process.exit(1);
});
