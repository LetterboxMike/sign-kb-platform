import { ChatUI } from '@/components/chat-ui';

export const dynamic = 'force-dynamic';

export default function ChatPage() {
  return (
    <div className="space-y-5">
      <div>
        <h1 className="text-xl font-semibold tracking-tight">Chat</h1>
        <p className="text-sm text-muted-foreground">
          Retrieval over the KB. The agent pulls relevant records, answers in plain language, and cites the records it
          used — click a source to verify it.
        </p>
      </div>
      <ChatUI />
    </div>
  );
}
