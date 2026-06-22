import { notFound } from 'next/navigation';
import Link from 'next/link';
import { FileText } from 'lucide-react';
import { getRecord, enumValuesFor } from '@/lib/kb';
import { sourceInfoFor } from '@/lib/review';
import { signedViewUrl } from '@/lib/storage';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { GradeBadge } from '@/components/grade-badge';
import { EditableField } from '@/components/editable-field';
import { AiEditWidget } from '@/components/ai-edit-widget';

export const dynamic = 'force-dynamic';
// Approving an inline/AI edit runs the full regression suite (retrieval + chat grounding) inline
// before committing, so the server action needs headroom beyond the default function timeout.
export const maxDuration = 300;

function Field({ label, value }: { label: string; value: React.ReactNode }) {
  if (value == null || value === '' || value === false) return null;
  return (
    <div className="flex flex-col gap-0.5">
      <dt className="text-xs uppercase tracking-wide text-muted-foreground">{label.replaceAll('_', ' ')}</dt>
      <dd className="text-sm">{value}</dd>
    </div>
  );
}

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

export default async function RecordPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const recordId = decodeURIComponent(id);
  const [rec, source] = await Promise.all([getRecord(recordId, { resolveRefs: true }), sourceInfoFor(recordId)]);
  if (!rec) notFound();

  const raw = rec.record ?? {};
  const cls = raw.classification ?? {};
  const k = raw.knowledge ?? {};
  const da = raw.design_assessment ?? {};
  const dims = raw.dimensions ?? {};
  const status = rec.status;
  const editable = status === 'live' || status === 'staging';
  // Stored drawings (uploaded via the app) resolve to a signed URL; CLI/JSON-imported records don't.
  const viewUrl = source?.path ? await signedViewUrl(source.path) : null;
  const obs: string[] = [
    ...(da.rules_observations ?? []),
    ...(da.craft_observations ?? []),
    ...(da.aesthetic_notes ?? []).map((o: any) => (typeof o === 'string' ? o : o?.note)).filter(Boolean),
  ];

  const ef = (label: string, path: string, value: any, kind: 'text' | 'textarea' | 'enum' = 'text', leaf?: string) =>
    editable ? (
      <EditableField
        recordId={recordId}
        status={status}
        path={path}
        label={label}
        value={value ?? null}
        kind={kind}
        options={kind === 'enum' ? enumValuesFor(leaf ?? label) : []}
      />
    ) : (
      <Field label={label} value={value?.toString().replaceAll('_', ' ')} />
    );

  return (
    <div className="space-y-6">
      <div>
        <Link href="/browse" className="text-sm text-muted-foreground hover:text-foreground">
          ← Back
        </Link>
        <div className="mt-2 flex flex-wrap items-center gap-3">
          <h1 className="text-xl font-semibold capitalize tracking-tight">
            {(cls.sign_category ?? raw.record_type ?? 'record')?.toString().replaceAll('_', ' ')}
            {cls.sub_type ? <span className="text-muted-foreground"> · {cls.sub_type.replaceAll('_', ' ')}</span> : null}
          </h1>
          <GradeBadge grade={da.quality_grade} />
          {status && status !== 'live' ? <Badge variant="destructive">{status}</Badge> : null}
        </div>
        <div className="mt-1 font-mono text-xs text-muted-foreground">{raw.record_id}</div>
        {editable ? (
          <p className="mt-2 text-xs text-muted-foreground">
            {status === 'live'
              ? 'Hover a field to edit. Live edits are governed — you’ll preview the change and approve it (eval-gated, with revert).'
              : 'Hover a field to edit. This record is staging, so edits save directly through the schema gate.'}
          </p>
        ) : null}
      </div>

      {editable ? <AiEditWidget recordId={recordId} status={status} /> : null}

      <Section title="Knowledge">
        <dl className="grid gap-4 sm:grid-cols-2">
          {ef('plain_language_summary', 'knowledge.plain_language_summary', k.plain_language_summary, 'textarea')}
          {ef('rationale', 'knowledge.rationale', k.rationale, 'textarea')}
          {ef('tradeoffs', 'knowledge.tradeoffs', k.tradeoffs, 'textarea')}
          {ef('when_to_use', 'knowledge.when_to_use', k.when_to_use, 'textarea')}
        </dl>
      </Section>

      <Section title="Classification">
        <dl className="grid grid-cols-2 gap-4 sm:grid-cols-3">
          <Field label="record_type" value={raw.record_type?.replaceAll('_', ' ')} />
          {ef('sign_category', 'classification.sign_category', cls.sign_category, 'enum')}
          {ef('sub_type', 'classification.sub_type', cls.sub_type, 'text')}
          {ef('fabrication_family', 'classification.fabrication_family', cls.fabrication_family, 'enum')}
          {ef('illumination_method', 'classification.illumination_method', cls.illumination_method, 'enum')}
          {ef('mounting', 'classification.mounting', cls.mounting, 'enum')}
          <Field label="sides" value={cls.sides} />
          <Field label="doc_type" value={raw.source?.doc_type?.replaceAll('_', ' ')} />
          <Field label="industry" value={raw.context?.industry_vertical?.replaceAll('_', ' ')} />
          <Field label="width_in" value={dims.overall_width_in ?? dims.width_in} />
          <Field label="height_in" value={dims.overall_height_in ?? dims.height_in} />
          <Field label="area_sqft" value={dims.area_sqft} />
        </dl>
      </Section>

      <Section title="Source drawing">
        {viewUrl ? (
          <iframe src={viewUrl} className="h-[600px] w-full rounded border" title="source drawing" />
        ) : (
          <div className="flex items-start gap-3 rounded-md border border-dashed p-6 text-sm text-muted-foreground">
            <FileText className="mt-0.5 h-4 w-4 shrink-0" />
            <p>
              No source drawing is served for this record. Inline preview is available for drawings uploaded through the app;
              JSON/CLI-imported records have no stored drawing.
            </p>
          </div>
        )}
      </Section>

      {Array.isArray(raw.structure) && raw.structure.length ? (
        <Section title={`Structure · ${raw.structure.length} component${raw.structure.length === 1 ? '' : 's'}`}>
          <div className="space-y-3">
            {raw.structure.map((c: any, i: number) => (
              <div key={i} className="rounded-md border p-3">
                <div className="flex items-center gap-2">
                  <span className="font-medium capitalize">{(c.component ?? 'component').replaceAll('_', ' ')}</span>
                  {c.provenance ? <Badge variant="outline" className="text-xs">{c.provenance}</Badge> : null}
                </div>
                {c.construction ? <p className="mt-1 text-sm text-muted-foreground">{c.construction}</p> : null}
                <div className="mt-1 flex flex-wrap gap-x-4 gap-y-0.5 text-xs text-muted-foreground">
                  {c.fabrication_method ? <span>method: {c.fabrication_method.replaceAll('_', ' ')}</span> : null}
                  {c.illumination ? <span>illumination: {c.illumination.replaceAll('_', ' ')}</span> : null}
                  {c.mounted_to ? <span>mounted to: {c.mounted_to.replaceAll('_', ' ')}</span> : null}
                </div>
              </div>
            ))}
          </div>
        </Section>
      ) : null}

      {rec.materials.length ? (
        <Section title={`Materials · ${rec.materials.length}`}>
          <div className="space-y-3">
            {rec.materials.map((m, i) => (
              <div key={i} className="rounded-md border p-3">
                <div className="flex flex-wrap items-center gap-2">
                  <span className="font-medium">{m.product ?? m.material_ref ?? 'material'}</span>
                  {m.category ? <Badge variant="secondary">{m.category.replaceAll('_', ' ')}</Badge> : null}
                  {m.application ? <Badge variant="outline">{m.application.replaceAll('_', ' ')}</Badge> : null}
                </div>
                {m.reference ? (
                  <div className="mt-2 rounded bg-muted/50 p-2 text-xs">
                    <div className="font-medium text-foreground">
                      <Link href={`/reference/${encodeURIComponent(m.reference.normalized_id)}`} className="underline-offset-2 hover:underline">
                        {m.reference.company ?? m.reference.product ?? m.reference.normalized_id}
                      </Link>
                      <span className="ml-2 font-normal text-muted-foreground">({m.reference.depth})</span>
                    </div>
                    {m.reference.knowledge ? <p className="mt-1 text-muted-foreground">{m.reference.knowledge}</p> : null}
                    {m.reference.optical_behavior ? (
                      <div className="mt-1.5">
                        <span className="text-muted-foreground">optical behavior: </span>
                        <span className="font-mono text-[11px]">{JSON.stringify(m.reference.optical_behavior)}</span>
                      </div>
                    ) : null}
                  </div>
                ) : m.manufacturer_normalized_id ? (
                  <div className="mt-1 text-xs text-muted-foreground">ref: {m.manufacturer_normalized_id} (unresolved)</div>
                ) : null}
              </div>
            ))}
          </div>
        </Section>
      ) : null}

      {obs.length ? (
        <Section title="Design assessment">
          <ul className="list-disc space-y-1 pl-5 text-sm">
            {obs.map((o, i) => (
              <li key={i}>{o}</li>
            ))}
          </ul>
        </Section>
      ) : null}

      {Array.isArray(raw.open_items) && raw.open_items.length ? (
        <Section title="Open items">
          <ul className="list-disc space-y-1 pl-5 text-sm text-muted-foreground">
            {raw.open_items.map((o: string, i: number) => (
              <li key={i}>{o}</li>
            ))}
          </ul>
        </Section>
      ) : null}

      <details className="rounded-lg border bg-card p-4">
        <summary className="cursor-pointer text-sm font-medium text-muted-foreground">Raw record (JSON)</summary>
        <pre className="mt-3 overflow-x-auto rounded bg-muted p-3 text-xs">{JSON.stringify(raw, null, 2)}</pre>
      </details>
    </div>
  );
}
