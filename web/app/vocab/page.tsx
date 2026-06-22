import Link from 'next/link';
import { CheckCircle2, ExternalLink } from 'lucide-react';
import { listProposedTerms } from '@/lib/kb';
import { Card } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { VocabResolve } from '@/components/vocab-resolve';

export const dynamic = 'force-dynamic';

export default async function VocabPage() {
  const terms = await listProposedTerms();

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-xl font-semibold tracking-tight">Vocabulary review</h1>
        <p className="text-sm text-muted-foreground">
          Values extraction flagged as <span className="font-mono">proposed_new_term</span> instead of inventing a synonym.
          Resolve each to a real enum value (written through the schema gate — a non-enum value is rejected; a genuinely
          new term needs a schema addition).
        </p>
      </div>

      {terms.length === 0 ? (
        <div className="flex items-center gap-2 rounded-lg border border-dashed p-6 text-sm text-muted-foreground">
          <CheckCircle2 className="h-4 w-4" /> No proposed terms awaiting review.
        </div>
      ) : (
        <div className="space-y-3">
          {terms.map((t, i) => (
            <Card key={`${t.record_id}-${t.field}-${i}`} className="p-4">
              <div className="flex flex-wrap items-center gap-2">
                <Badge variant="secondary">{t.field}</Badge>
                {t.status && t.status !== 'live' ? <Badge variant="outline">{t.status}</Badge> : null}
                <Link
                  href={`/record/${encodeURIComponent(t.record_id)}`}
                  target="_blank"
                  className="inline-flex items-center gap-1 font-mono text-xs text-muted-foreground hover:text-foreground"
                >
                  {t.record_id} <ExternalLink className="h-3 w-3" />
                </Link>
              </div>
              <div className="mt-3">
                {t.path ? (
                  <VocabResolve recordId={t.record_id} path={t.path} />
                ) : (
                  <p className="text-xs text-muted-foreground">
                    Material-level term — resolve on the record (via the Corrections workflow or by re-ingesting).
                  </p>
                )}
              </div>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}
