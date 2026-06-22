import { notFound } from 'next/navigation';
import Link from 'next/link';
import { getRecord } from '@/lib/kb';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { GradeBadge } from '@/components/grade-badge';

export const dynamic = 'force-dynamic';

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
  const rec = await getRecord(decodeURIComponent(id), { resolveRefs: true });
  if (!rec) notFound();

  const raw = rec.record ?? {};
  const cls = raw.classification ?? {};
  const k = raw.knowledge ?? {};
  const da = raw.design_assessment ?? {};
  const dims = raw.dimensions ?? {};
  const obs: string[] = [
    ...(da.rules_observations ?? []),
    ...(da.craft_observations ?? []),
    ...(da.aesthetic_notes ?? []).map((o: any) => (typeof o === 'string' ? o : o?.note)).filter(Boolean),
  ];

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
          {rec.status && rec.status !== 'live' ? <Badge variant="destructive">{rec.status}</Badge> : null}
        </div>
        <div className="mt-1 font-mono text-xs text-muted-foreground">{raw.record_id}</div>
      </div>

      {(k.plain_language_summary || k.rationale || k.tradeoffs || k.when_to_use) && (
        <Section title="Knowledge">
          <div className="space-y-3 text-sm leading-relaxed">
            {k.plain_language_summary ? <p>{k.plain_language_summary}</p> : null}
            {k.rationale ? <p><span className="text-muted-foreground">Rationale. </span>{k.rationale}</p> : null}
            {k.tradeoffs ? <p><span className="text-muted-foreground">Tradeoffs. </span>{k.tradeoffs}</p> : null}
            {k.when_to_use ? <p><span className="text-muted-foreground">When to use. </span>{k.when_to_use}</p> : null}
          </div>
        </Section>
      )}

      <Section title="Classification">
        <dl className="grid grid-cols-2 gap-4 sm:grid-cols-3">
          <Field label="record_type" value={raw.record_type?.replaceAll('_', ' ')} />
          <Field label="category" value={cls.sign_category?.replaceAll('_', ' ')} />
          <Field label="sub_type" value={cls.sub_type?.replaceAll('_', ' ')} />
          <Field label="fabrication_family" value={cls.fabrication_family?.replaceAll('_', ' ')} />
          <Field label="illumination" value={cls.illuminated ? cls.illumination_method?.replaceAll('_', ' ') ?? 'yes' : 'non illuminated'} />
          <Field label="mounting" value={cls.mounting?.replaceAll('_', ' ')} />
          <Field label="sides" value={cls.sides} />
          <Field label="doc_type" value={raw.source?.doc_type?.replaceAll('_', ' ')} />
          <Field label="industry" value={raw.context?.industry_vertical?.replaceAll('_', ' ')} />
          <Field label="width_in" value={dims.overall_width_in ?? dims.width_in} />
          <Field label="height_in" value={dims.overall_height_in ?? dims.height_in} />
          <Field label="area_sqft" value={dims.area_sqft} />
        </dl>
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
                      {m.reference.company ?? m.reference.product ?? m.reference.normalized_id}
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
