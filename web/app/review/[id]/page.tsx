import { notFound } from 'next/navigation';
import Link from 'next/link';
import { FileText, ExternalLink } from 'lucide-react';
import { getRecord } from '@/lib/kb';
import { sourceInfoFor } from '@/lib/review';
import { signedViewUrl } from '@/lib/storage';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { ReviewActions } from '@/components/review-actions';

export const dynamic = 'force-dynamic';

export default async function ReviewDetail({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const recordId = decodeURIComponent(id);
  const [rec, source] = await Promise.all([getRecord(recordId, { resolveRefs: true }), sourceInfoFor(recordId)]);
  if (!rec) notFound();

  const raw = rec.record ?? {};
  const cls = raw.classification ?? {};
  const k = raw.knowledge ?? {};
  // Stored drawings (uploaded via the app) resolve to a signed URL; CLI-ingested local paths don't.
  const viewUrl = source?.path ? await signedViewUrl(source.path) : null;
  const sourceLabel = source?.filename ?? source?.path ?? null;

  return (
    <div className="space-y-6">
      <div>
        <Link href="/review" className="text-sm text-muted-foreground hover:text-foreground">
          ← Review queue
        </Link>
        <div className="mt-2 flex flex-wrap items-center gap-3">
          <h1 className="text-xl font-semibold capitalize tracking-tight">
            {(cls.sign_category ?? raw.record_type ?? 'record')?.toString().replaceAll('_', ' ')}
            {cls.sub_type ? <span className="text-muted-foreground"> · {cls.sub_type.replaceAll('_', ' ')}</span> : null}
          </h1>
          <Badge variant={rec.status === 'live' ? 'default' : rec.status === 'rejected' ? 'destructive' : 'secondary'}>
            {rec.status}
          </Badge>
        </div>
        <div className="mt-1 font-mono text-xs text-muted-foreground">{raw.record_id}</div>
      </div>

      {rec.status === 'staging' ? <ReviewActions recordId={recordId} /> : null}

      <div className="grid gap-4 lg:grid-cols-2">
        {/* Candidate */}
        <div className="space-y-4">
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-sm font-medium text-muted-foreground">Candidate</CardTitle>
            </CardHeader>
            <CardContent className="space-y-3 text-sm">
              {k.plain_language_summary ? <p className="leading-relaxed">{k.plain_language_summary}</p> : null}
              <div className="flex flex-wrap gap-1.5">
                <Badge variant="secondary">{raw.record_type?.replaceAll('_', ' ')}</Badge>
                {cls.illuminated && cls.illumination_method ? <Badge variant="outline">{cls.illumination_method.replaceAll('_', ' ')}</Badge> : null}
                {cls.fabrication_family ? <Badge variant="outline">{cls.fabrication_family.replaceAll('_', ' ')}</Badge> : null}
                {cls.mounting ? <Badge variant="outline">{cls.mounting.replaceAll('_', ' ')}</Badge> : null}
              </div>
              {Array.isArray(raw.structure) ? (
                <div className="text-xs text-muted-foreground">{raw.structure.length} component(s) · {rec.materials.length} material(s)</div>
              ) : null}
              <Link
                href={`/record/${encodeURIComponent(recordId)}`}
                target="_blank"
                className="inline-flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground"
              >
                <ExternalLink className="h-3 w-3" /> open full record view
              </Link>
            </CardContent>
          </Card>

          <details className="rounded-lg border bg-card p-4">
            <summary className="cursor-pointer text-sm font-medium text-muted-foreground">Raw candidate (JSON)</summary>
            <pre className="mt-3 max-h-[480px] overflow-auto rounded bg-muted p-3 text-xs">{JSON.stringify(raw, null, 2)}</pre>
          </details>
        </div>

        {/* Source drawing */}
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="flex items-center gap-2 text-sm font-medium text-muted-foreground">
              <FileText className="h-4 w-4" /> Source drawing
            </CardTitle>
          </CardHeader>
          <CardContent>
            {viewUrl ? (
              <iframe src={viewUrl} className="h-[600px] w-full rounded border" title="source drawing" />
            ) : (
              <div className="rounded-md border border-dashed p-6 text-sm text-muted-foreground">
                <div className="font-mono text-xs">{sourceLabel ?? 'unknown source'}</div>
                <p className="mt-2">
                  Inline preview is available for drawings uploaded through the app (stored in the cloud). This record was
                  ingested from a local file, so the drawing isn&apos;t served here.
                </p>
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
