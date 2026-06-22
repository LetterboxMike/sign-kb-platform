import Link from 'next/link';
import { Inbox, AlertTriangle, FileText } from 'lucide-react';
import { stagingItems, flaggedJobs } from '@/lib/review';
import { Card } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';

export const dynamic = 'force-dynamic';

export default async function ReviewPage() {
  const [items, flagged] = await Promise.all([stagingItems(), flaggedJobs()]);

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-xl font-semibold tracking-tight">Review queue</h1>
        <p className="text-sm text-muted-foreground">
          Candidate records from ingestion, staged for approval. Nothing here is live until you approve it.
        </p>
      </div>

      {items.length === 0 && flagged.length === 0 ? (
        <div className="flex items-center gap-2 rounded-lg border border-dashed p-6 text-sm text-muted-foreground">
          <Inbox className="h-4 w-4" /> Nothing waiting for review.
        </div>
      ) : null}

      {items.length > 0 ? (
        <section className="space-y-3">
          <h2 className="text-sm font-medium text-muted-foreground">Staged · {items.length}</h2>
          <div className="grid gap-3 sm:grid-cols-2">
            {items.map((it) => (
              <Link key={it.record_id} href={`/review/${encodeURIComponent(it.record_id)}`}>
                <Card className="h-full p-4 transition-colors hover:border-ring hover:bg-accent/40">
                  <div className="flex items-center justify-between gap-2">
                    <span className="font-medium capitalize">
                      {(it.sign_category ?? it.record_type ?? 'record').replaceAll('_', ' ')}
                    </span>
                    <Badge variant="secondary">staging</Badge>
                  </div>
                  <div className="mt-1 font-mono text-xs text-muted-foreground">{it.record_id}</div>
                  {it.source_filename ? (
                    <div className="mt-2 flex items-center gap-1 text-xs text-muted-foreground">
                      <FileText className="h-3 w-3" /> {it.source_filename}
                    </div>
                  ) : null}
                  {it.raw?.knowledge?.plain_language_summary ? (
                    <p className="mt-2 line-clamp-2 text-sm text-muted-foreground">{it.raw.knowledge.plain_language_summary}</p>
                  ) : null}
                </Card>
              </Link>
            ))}
          </div>
        </section>
      ) : null}

      {flagged.length > 0 ? (
        <section className="space-y-3">
          <h2 className="flex items-center gap-1 text-sm font-medium text-muted-foreground">
            <AlertTriangle className="h-4 w-4" /> Flagged (schema-invalid — fix before staging)
          </h2>
          {flagged.map((j) => (
            <Card key={j.id} className="p-4">
              <div className="text-sm font-medium">{j.source_filename ?? j.id}</div>
              <ul className="mt-2 space-y-1 text-xs text-muted-foreground">
                {j.flagged.map((f, i) => (
                  <li key={i}>
                    <span className="font-mono">{f.proposed_record_id ?? '(no id)'}</span> — {f.errors.slice(0, 3).join('; ')}
                  </li>
                ))}
              </ul>
            </Card>
          ))}
        </section>
      ) : null}
    </div>
  );
}
