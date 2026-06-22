import Link from 'next/link';
import { Search as SearchIcon, LayoutGrid, List as ListIcon } from 'lucide-react';
import { search, filter, type SignFilters } from '@/lib/kb';
import { getFacets, type FacetColumn } from '@/lib/queries';
import { RecordCard, type RecordCardData } from '@/components/record-card';
import { RecordRow } from '@/components/record-row';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';

export const dynamic = 'force-dynamic';

const FILTERS: { key: FacetColumn; label: string }[] = [
  { key: 'record_type', label: 'Type' },
  { key: 'sign_category', label: 'Category' },
  { key: 'sub_type', label: 'Sub-type' },
  { key: 'fabrication_family', label: 'Fabrication' },
  { key: 'illumination_method', label: 'Illumination' },
  { key: 'mounting', label: 'Mounting' },
  { key: 'doc_type', label: 'Doc type' },
  { key: 'industry_vertical', label: 'Industry' },
  { key: 'design_status', label: 'Design status' },
  { key: 'quality_grade', label: 'Grade' },
];

const LIMIT = 200;
const SEARCH_K = 60;

function toCardData(raw: any, record_id: string, record_type: string | null, sign_category: string | null, snippet?: string): RecordCardData {
  return {
    record_id,
    record_type,
    sign_category,
    sub_type: raw?.classification?.sub_type ?? null,
    illumination_method: raw?.classification?.illumination_method ?? null,
    quality_grade: raw?.design_assessment?.quality_grade ?? null,
    raw,
    snippet: snippet ?? null,
  };
}

export default async function BrowsePage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const sp = await searchParams;
  const facets = await getFacets();

  const q = (sp.q ?? '').toString().trim();
  const view = (sp.view ?? '').toString() === 'list' ? 'list' : 'card';
  const sort = (sp.sort ?? '').toString();

  const criteria: SignFilters = {};
  for (const { key } of FILTERS) {
    const v = (sp[key] ?? '').toString();
    if (v) criteria[key] = v;
  }
  const hasFilters = Object.keys(criteria).length > 0;

  // Hybrid: free-text query ranks by semantic similarity (still honoring the facets); no query
  // falls back to exact faceted filter over the live corpus.
  let results: RecordCardData[];
  let capped = false;
  if (q) {
    const hits = await search(q, criteria, SEARCH_K);
    results = hits.map((h) => toCardData(h.raw, h.record_id, h.record_type, h.sign_category, h.text));
  } else {
    const rows = await filter(criteria, LIMIT);
    capped = rows.length === LIMIT;
    results = rows.map((r) => toCardData(r.raw, r.record_id, r.record_type, r.sign_category));
  }

  // In-memory sort (relevance order is kept for queries unless an explicit sort is chosen).
  if (sort === 'id') results = [...results].sort((a, b) => a.record_id.localeCompare(b.record_id));
  else if (sort === 'category')
    results = [...results].sort((a, b) => (a.sign_category ?? '').localeCompare(b.sign_category ?? ''));

  // Build hrefs that preserve the current query state while overriding specific params.
  const buildHref = (overrides: Record<string, string | undefined>) => {
    const params = new URLSearchParams();
    if (q) params.set('q', q);
    for (const { key } of FILTERS) if (criteria[key]) params.set(key, String(criteria[key]));
    if (sort) params.set('sort', sort);
    if (view === 'list') params.set('view', 'list');
    for (const [k, v] of Object.entries(overrides)) {
      if (v === undefined || v === '') params.delete(k);
      else params.set(k, v);
    }
    const s = params.toString();
    return s ? `/browse?${s}` : '/browse';
  };

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-xl font-semibold tracking-tight">Browse</h1>
        <p className="text-sm text-muted-foreground">
          Search the live corpus by keyword and narrow with facets — keyword ranks by relevance, facets filter exactly.
        </p>
      </div>

      <form method="get" className="space-y-3">
        <div className="flex gap-2">
          <div className="relative flex-1">
            <SearchIcon className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <Input name="q" defaultValue={q} placeholder="Search, e.g. halo-lit concrete monument" className="pl-9" />
          </div>
          {/* Preserve view/sort across a facet submit. */}
          {view === 'list' ? <input type="hidden" name="view" value="list" /> : null}
          {sort ? <input type="hidden" name="sort" value={sort} /> : null}
          <Button type="submit">Apply</Button>
        </div>
        <div className="flex flex-wrap items-end gap-3">
          {FILTERS.map(({ key, label }) =>
            facets[key].length ? (
              <label key={key} className="flex flex-col gap-1 text-xs text-muted-foreground">
                {label}
                <select
                  name={key}
                  defaultValue={(criteria[key] as string) ?? ''}
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
            ) : null,
          )}
        </div>
      </form>

      <div className="flex flex-wrap items-center justify-between gap-3">
        <p className="text-sm text-muted-foreground">
          {results.length}
          {capped ? '+' : ''} record{results.length === 1 ? '' : 's'}
          {q ? <> for “{q}”</> : null}
          {(hasFilters || q) ? (
            <Link href="/browse" className="ml-3 text-muted-foreground underline-offset-2 hover:text-foreground hover:underline">
              Clear
            </Link>
          ) : null}
        </p>
        <div className="flex items-center gap-3">
          <div className="flex items-center gap-1 text-xs text-muted-foreground">
            Sort
            <div className="flex overflow-hidden rounded-md border">
              {[
                { v: '', label: q ? 'Relevance' : 'Default' },
                { v: 'id', label: 'ID' },
                { v: 'category', label: 'Category' },
              ].map((o) => (
                <Link
                  key={o.v}
                  href={buildHref({ sort: o.v || undefined })}
                  className={cn('px-2 py-1', sort === o.v ? 'bg-secondary text-secondary-foreground' : 'hover:bg-accent')}
                >
                  {o.label}
                </Link>
              ))}
            </div>
          </div>
          <div className="flex overflow-hidden rounded-md border">
            <Link
              href={buildHref({ view: undefined })}
              aria-label="Card view"
              className={cn('px-2 py-1.5', view === 'card' ? 'bg-secondary text-secondary-foreground' : 'hover:bg-accent')}
            >
              <LayoutGrid className="h-4 w-4" />
            </Link>
            <Link
              href={buildHref({ view: 'list' })}
              aria-label="List view"
              className={cn('px-2 py-1.5', view === 'list' ? 'bg-secondary text-secondary-foreground' : 'hover:bg-accent')}
            >
              <ListIcon className="h-4 w-4" />
            </Link>
          </div>
        </div>
      </div>

      {results.length === 0 ? (
        <div className="rounded-lg border border-dashed p-6 text-sm text-muted-foreground">
          No records match. Try a different keyword or clear some facets.
        </div>
      ) : view === 'list' ? (
        <div className="space-y-2">
          {results.map((r) => (
            <RecordRow key={r.record_id} data={r} />
          ))}
        </div>
      ) : (
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {results.map((r) => (
            <RecordCard key={r.record_id} data={r} />
          ))}
        </div>
      )}
    </div>
  );
}
