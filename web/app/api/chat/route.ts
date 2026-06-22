import { NextResponse } from 'next/server';
import { answerQuestion, type ChatMessage } from '@/lib/kb';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function POST(req: Request) {
  try {
    const body = (await req.json()) as { question?: unknown; history?: unknown };
    const question = typeof body.question === 'string' ? body.question.trim() : '';
    if (!question) return NextResponse.json({ error: 'A question is required.' }, { status: 400 });
    const history = Array.isArray(body.history) ? (body.history as ChatMessage[]) : [];
    const result = await answerQuestion(question, { history });
    return NextResponse.json(result);
  } catch (e) {
    const message = e instanceof Error ? e.message : 'Chat failed.';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
