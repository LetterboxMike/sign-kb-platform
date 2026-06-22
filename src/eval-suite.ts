import { runEval, passes, type EvalReport } from './eval';
import { runChatEval, chatEvalPasses, type ChatEvalReport } from './eval-chat';

/**
 * The regression suite: the read-side evals that must hold after a corpus mutation — retrieval
 * (semantic search still finds the right records/canon) AND chat grounding (citations resolve, no
 * fabrication). This is the gate the governed-correction workflow runs before committing
 * (build-plan eval #7 — "the full suite passes after any committed correction"), and the same
 * suite the scheduled /api/eval route runs for ongoing monitoring.
 *
 * It is read-only: it never mutates the corpus, so it is safe to run on a schedule against prod.
 */

export interface SuiteResult {
  ok: boolean;
  reasons: string[];
  retrieval: { ok: boolean; reasons: string[]; metrics: EvalReport['metrics'] };
  chat: { ok: boolean; reasons: string[]; metrics: ChatEvalReport['metrics']; failures: string[] };
}

export async function runRegressionSuite(): Promise<SuiteResult> {
  const retrievalReport = await runEval();
  const rv = passes(retrievalReport.metrics);

  const chatReport = await runChatEval();
  const cv = chatEvalPasses(chatReport);

  const reasons = [
    ...rv.reasons.map((r) => `retrieval: ${r}`),
    ...cv.reasons.map((r) => `chat: ${r}`),
  ];

  return {
    ok: rv.ok && cv.ok,
    reasons,
    retrieval: { ok: rv.ok, reasons: rv.reasons, metrics: retrievalReport.metrics },
    chat: { ok: cv.ok, reasons: cv.reasons, metrics: chatReport.metrics, failures: chatReport.failures },
  };
}
