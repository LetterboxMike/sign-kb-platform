'use client';

import { useRef, useState } from 'react';
import Link from 'next/link';
import { Send, AlertTriangle } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { cn } from '@/lib/utils';

interface Citation {
  record_id: string;
  sign_category: string | null;
}
interface Message {
  role: 'user' | 'assistant';
  content: string;
  citations?: Citation[];
  fabricated?: string[];
}

const EXAMPLES = [
  'How do halo-lit channel letters differ from front-lit ones?',
  'What goes into a board-formed concrete monument base?',
  'When would you use a push-through acrylic face?',
];

export function ChatUI() {
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const endRef = useRef<HTMLDivElement>(null);

  async function ask(question: string) {
    const q = question.trim();
    if (!q || loading) return;
    setError(null);
    const history = messages.map((m) => ({ role: m.role, content: m.content }));
    setMessages((m) => [...m, { role: 'user', content: q }]);
    setInput('');
    setLoading(true);
    try {
      const res = await fetch('/api/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ question: q, history }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Chat failed.');
      setMessages((m) => [
        ...m,
        { role: 'assistant', content: data.answer, citations: data.citations, fabricated: data.fabricated },
      ]);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Chat failed.');
    } finally {
      setLoading(false);
      requestAnimationFrame(() => endRef.current?.scrollIntoView({ behavior: 'smooth' }));
    }
  }

  return (
    <div className="flex flex-col gap-4">
      <div className="min-h-[320px] space-y-4">
        {messages.length === 0 ? (
          <div className="rounded-lg border border-dashed p-6 text-sm text-muted-foreground">
            <p>Ask the knowledge base anything about the corpus. Answers are grounded in retrieved records and cite them.</p>
            <div className="mt-3 flex flex-col gap-2">
              {EXAMPLES.map((ex) => (
                <button
                  key={ex}
                  onClick={() => ask(ex)}
                  className="text-left text-sm text-foreground underline-offset-2 hover:underline"
                >
                  → {ex}
                </button>
              ))}
            </div>
          </div>
        ) : (
          messages.map((m, i) => (
            <div key={i} className={cn('flex', m.role === 'user' ? 'justify-end' : 'justify-start')}>
              <div
                className={cn(
                  'max-w-[85%] rounded-lg px-4 py-2.5 text-sm',
                  m.role === 'user' ? 'bg-primary text-primary-foreground' : 'border bg-card',
                )}
              >
                <p className="whitespace-pre-wrap leading-relaxed">{m.content}</p>
                {m.fabricated && m.fabricated.length > 0 ? (
                  <div className="mt-2 flex items-center gap-1 text-xs text-destructive">
                    <AlertTriangle className="h-3 w-3" /> referenced unknown ids: {m.fabricated.join(', ')}
                  </div>
                ) : null}
                {m.citations && m.citations.length > 0 ? (
                  <div className="mt-3 border-t pt-2">
                    <div className="mb-1 text-xs text-muted-foreground">Sources</div>
                    <div className="flex flex-wrap gap-1.5">
                      {m.citations.map((c) => (
                        <Link key={c.record_id} href={`/record/${encodeURIComponent(c.record_id)}`} target="_blank">
                          <Badge variant="secondary" className="font-mono text-[11px] hover:bg-secondary/70">
                            {c.record_id}
                          </Badge>
                        </Link>
                      ))}
                    </div>
                  </div>
                ) : null}
              </div>
            </div>
          ))
        )}
        {loading ? <div className="text-sm text-muted-foreground">Thinking…</div> : null}
        {error ? <div className="text-sm text-destructive">{error}</div> : null}
        <div ref={endRef} />
      </div>

      <form
        onSubmit={(e) => {
          e.preventDefault();
          ask(input);
        }}
        className="flex gap-2"
      >
        <Input
          value={input}
          onChange={(e) => setInput(e.target.value)}
          placeholder="Ask the knowledge base…"
          disabled={loading}
        />
        <Button type="submit" size="icon" disabled={loading || !input.trim()}>
          <Send className="h-4 w-4" />
        </Button>
      </form>
    </div>
  );
}
