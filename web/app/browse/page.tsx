import Link from 'next/link';
import { filter } from '@/lib/kb';
import { getFacets, type FacetColumn } from '@/lib/queries';
import { RecordCard, type RecordCardData } from '@/components/record-card';
import { Button } from '@/components/ui/button';

export const dynamic = 'force-dynamic';

const FILTERS: { key: FacetColumn; label: string }[] = [
  { key: 'record_type', label: 'Type' },
  { key: 'sign_category', label: 'Category' },
  { key: 'fabrication_family', label: 'Fabrication' },
  { key: 'illumination_method', label: 'Illumination' },
  { key: 'mounting', label: 'Mounting' },
];

const LIMIT = 200;

export default async function BrowsePage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const sp = await searchParams;
  const facets = await getFacets();

  const criteria: Record<string, string> = {};
  for (const { key } of FILTERS) {
    const v = (sp[key] ?? '').toString();
    if (v) criteria[key] = v;
  }

  const rows = await filter(criteria, LIMIT);
  const results: RecordCardData[] = rows.map((r) => ({
    record_id: r.record_id,
    record_type: r.record_type,
    sign_category: r.sign_category,
    sub_type: r.sub_type,
    illumination_method: r.illumination_method,
    quality_grade: r.quality_grade,
    raw: r.raw,
  }));
  const hasFilters = Object.keys(criteria).length > 0;

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-xl font-semibold tracking-tight">Browse</h1>
        <p className="text-sm text-muted-foreground">Faceted, exact filtering over the live corpus.</p>
      </div>

      <form method="get" className="flex flex-wrap items-end gap-3">
        {FILTERS.map(({ key, label }) => (
          <label key={key} className="flex flex-col gap-1 text-xs text-muted-foreground">
            {label}
            <select
              name={key}
              defaultValue={criteria[key] ?? ''}
              className="h-9 rounded-md border border-input bg-background px-2 text-sm text-foreground"
            >
              <option value="">Any</option>
              {facets[key].map((v) => (
                <option key={v} value={v}>
                  {v.replaceAll('_', ' ')}
                </option>
              ))}
            </select>
          </label>
        ))}
        <Button type="submit">Apply</Button>
        {hasFilters ? (
          <Link
            href="/browse"
            className="inline-flex h-9 items-center rounded-md px-3 text-sm text-muted-foreground hover:bg-accent hover:text-foreground"
          >
            Clear
          </Link>
        ) : null}
      </form>

      <p className="text-sm text-muted-foreground">
        {rows.length}
        {rows.length === LIMIT ? '+' : ''} record{rows.length === 1 ? '' : 's'}
      </p>
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        {results.map((r) => (
          <RecordCard key={r.record_id} data={r} />
        ))}
      </div>
    </div>
  );
}
