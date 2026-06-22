import { notFound } from 'next/navigation';
import Link from 'next/link';
import { getReferenceEntry } from '@/lib/kb';
import { referenceUsage } from '@/lib/queries';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';

export const dynamic = 'force-dynamic';

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <Card>
      <CardHeader className="pb-3">
        <CardTitle className="text-sm font-medium text-muted-foreground">{title}</CardTitle>
      </CardHeader>
      <CardContent>{children}</CardContent>
    </Card>
  );
}

/** Render optical_behavior (free-form jsonb) as readable rows when it's an object, else as text. */
function OpticalBehavior({ value }: { value: any }) {
  if (value == null) return null;
  if (typeof value === 'object' && !Array.isArray(value)) {
    return (
      <dl className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        {Object.entries(value).map(([k, v]) => (
          <div key={k} className="flex flex-col gap-0.5">
            <dt className="text-xs uppercase tracking-wide text-muted-foreground">{k.replaceAll('_', ' ')}</dt>
            <dd className="text-sm">{typeof v === 'string' ? v : JSON.stringify(v)}</dd>
          </div>
        ))}
      </dl>
    );
  }
  return <p className="text-sm">{typeof value === 'string' ? value : JSON.stringify(value)}</p>;
}

export default async function ReferenceDetail({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const normalizedId = decodeURIComponent(id);
  const [entry, usage] = await Promise.all([getReferenceEntry(normalizedId), referenceUsage(normalizedId)]);
  if (!entry) notFound();

  return (
    <div className="space-y-6">
      <div>
        <Link href="/reference" className="text-sm text-muted-foreground hover:text-foreground">
          ← Reference
        </Link>
        <div className="mt-2 flex flex-wrap items-center gap-3">
          <h1 className="text-xl font-semibold tracking-tight">{entry.company ?? entry.product ?? entry.normalized_id}</h1>
          {entry.category ? <Badge variant="secondary">{entry.category}</Badge> : null}
          <Badge variant="outline">{entry.depth}</Badge>
        </div>
        <div className="mt-1 font-mono text-xs text-muted-foreground">{entry.normalized_id}</div>
      </div>

      {entry.knowledge ? (
        <Section title="Knowledge">
          <p className="text-sm leading-relaxed">{entry.knowledge}</p>
        </Section>
      ) : null}

      {entry.product && entry.company ? (
        <Section title="Product">
          <p className="text-sm">{entry.product}</p>
        </Section>
      ) : null}

      {entry.optical_behavior ? (
        <Section title="Optical behavior">
          <OpticalBehavior value={entry.optical_behavior} />
        </Section>
      ) : null}

      <Section title={`Used by · ${usage.length} record${usage.length === 1 ? '' : 's'}`}>
        {usage.length === 0 ? (
          <p className="text-sm text-muted-foreground">No live records currently resolve to this entry.</p>
        ) : (
          <ul className="space-y-1">
            {usage.map((u) => (
              <li key={u.record_id}>
                <Link
                  href={`/record/${encodeURIComponent(u.record_id)}`}
                  className="inline-flex items-center gap-2 text-sm underline-offset-2 hover:underline"
                >
                  <span className="font-mono text-xs text-muted-foreground">{u.record_id}</span>
                  {u.sign_category ? <span className="capitalize">{u.sign_category.replaceAll('_', ' ')}</span> : null}
                </Link>
              </li>
            ))}
          </ul>
        )}
      </Section>

      <details className="rounded-lg border bg-card p-4">
        <summary className="cursor-pointer text-sm font-medium text-muted-foreground">Raw entry (JSON)</summary>
        <pre className="mt-3 overflow-x-auto rounded bg-muted p-3 text-xs">{JSON.stringify(entry, null, 2)}</pre>
      </details>
    </div>
  );
}
