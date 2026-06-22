'use client';

import { useRef, useState } from 'react';
import Link from 'next/link';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import { Send, AlertTriangle, ChevronDown, ChevronRight, FileText } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { cn } from '@/lib/utils';

interface Citation {
  record_id: string;
  sign_category: string | null;
}
interface Message {
  role: 'user' | 'assistant';
  content: string;
  suggestions?: string[];
  citations?: Citation[];
  fabricated?: string[];
}

const OPENERS = [
  'How is a channel letter sign built?',
  'What makes a good monument sign?',
  'Tell me about illuminated cabinet signs',
];

function References({ citations }: { citations: Citation[] }) {
  const [open, setOpen] = useState(false);
  if (!citations.length) return null;
  return (
    <div className="mt-3 border-t pt-2">
      <button
        onClick={() => setOpen((o) => !o)}
        className="flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground"
      >
        {open ? <ChevronDown className="h-3 w-3" /> : <ChevronRight className="h-3 w-3" />}
        <FileText className="h-3 w-3" /> {citations.length} source{citations.length === 1 ? '' : 's'}
      </button>
      {open ? (
        <ul className="mt-2 space-y-1">
          {citations.map((c) => (
            <li key={c.record_id}>
              <Link
                href={`/record/${encodeURIComponent(c.record_id)}`}
                target="_blank"
                className="font-mono text-[11px] text-muted-foreground underline-offset-2 hover:text-foreground hover:underline"
              >
                {c.record_id}
              </Link>
              {c.sign_category ? <span className="ml-2 text-[11px] text-muted-foreground">{c.sign_category.replaceAll('_', ' ')}</span> : null}
            </li>
          ))}
        </ul>
      ) : null}
    </div>
  );
}

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
        {
          role: 'assistant',
          content: data.reply,
          suggestions: data.suggestions,
          citations: data.citations,
          fabricated: data.fabricated,
        },
      ]);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Chat failed.');
    } finally {
      setLoading(false);
      requestAnimationFrame(() => endRef.current?.scrollIntoView({ behavior: 'smooth' }));
    }
  }

  const lastAssistantIdx = messages.map((m) => m.role).lastIndexOf('assistant');

  return (
    <div className="flex flex-col gap-4">
      <div className="min-h-[340px] space-y-4">
        {messages.length === 0 ? (
          <div className="rounded-lg border border-dashed p-6 text-sm text-muted-foreground">
            <p>Ask the knowledge base anything about the corpus. I&apos;ll narrow down with you and cite the records behind every answer.</p>
            <div className="mt-3 flex flex-col gap-2">
              {OPENERS.map((ex) => (
                <button key={ex} onClick={() => ask(ex)} className="text-left text-sm text-foreground underline-offset-2 hover:underline">
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
                {m.role === 'assistant' ? (
                  <div className="prose prose-sm max-w-none dark:prose-invert prose-p:my-2 prose-ul:my-2 prose-li:my-0.5 prose-headings:mt-3 prose-headings:mb-1">
                    <ReactMarkdown remarkPlugins={[remarkGfm]}>{m.content}</ReactMarkdown>
                  </div>
                ) : (
                  <p className="whitespace-pre-wrap leading-relaxed">{m.content}</p>
                )}

                {m.fabricated && m.fabricated.length > 0 ? (
                  <div className="mt-2 flex items-center gap-1 text-xs text-destructive">
                    <AlertTriangle className="h-3 w-3" /> referenced unknown ids: {m.fabricated.join(', ')}
                  </div>
                ) : null}

                {m.role === 'assistant' && m.citations ? <References citations={m.citations} /> : null}

                {m.role === 'assistant' && i === lastAssistantIdx && m.suggestions && m.suggestions.length > 0 ? (
                  <div className="mt-3 flex flex-wrap gap-2">
                    {m.suggestions.map((s) => (
                      <button
                        key={s}
                        onClick={() => ask(s)}
                        disabled={loading}
                        className="rounded-full border bg-background px-3 py-1 text-xs font-medium transition-colors hover:bg-accent disabled:opacity-50"
                      >
                        {s}
                      </button>
                    ))}
                  </div>
                ) : null}
              </div>
            </div>
          ))
        )}
        {loading ? <div className="text-sm text-muted-foreground">Thinking…</div> : null}
        {error ? (
          <div className="flex items-center gap-2 text-sm text-destructive">
            <span>{error}</span>
            {messages.length > 0 && messages[messages.length - 1].role === 'user' ? (
              <Button size="sm" variant="outline" onClick={() => ask(messages[messages.length - 1].content)} disabled={loading}>
                Retry
              </Button>
            ) : null}
          </div>
        ) : null}
        <div ref={endRef} />
      </div>

      <form
        onSubmit={(e) => {
          e.preventDefault();
          ask(input);
        }}
        className="flex gap-2"
      >
        <Input value={input} onChange={(e) => setInput(e.target.value)} placeholder="Ask the knowledge base…" disabled={loading} />
        <Button type="submit" size="icon" disabled={loading || !input.trim()}>
          <Send className="h-4 w-4" />
        </Button>
      </form>
    </div>
  );
}
