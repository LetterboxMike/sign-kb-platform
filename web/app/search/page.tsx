import { Search as SearchIcon } from 'lucide-react';
import { search, listSavedQueries, type SignFilters } from '@/lib/kb';
import { getFacets } from '@/lib/queries';
import { RecordCard, type RecordCardData } from '@/components/record-card';
import { SavedQueries } from '@/components/saved-queries';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';

export const dynamic = 'force-dynamic';

export default async function SearchPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const sp = await searchParams;
  const q = (sp.q ?? '').toString().trim();
  const category = (sp.category ?? '').toString();
  const [facets, saved] = await Promise.all([getFacets(), listSavedQueries()]);

  const filters: SignFilters = category ? { sign_category: category } : {};
  let results: RecordCardData[] = [];
  if (q) {
    const hits = await search(q, filters, 24);
    results = hits.map((h) => ({
      record_id: h.record_id,
      record_type: h.record_type,
      sign_category: h.sign_category,
      sub_type: h.raw?.classification?.sub_type ?? null,
      illumination_method: h.raw?.classification?.illumination_method ?? null,
      quality_grade: h.raw?.design_assessment?.quality_grade ?? null,
      raw: h.raw,
      snippet: h.text,
    }));
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-xl font-semibold tracking-tight">Search</h1>
        <p className="text-sm text-muted-foreground">
          Natural-language semantic search, ranked by relevance. Optionally constrain by category.
        </p>
      </div>

      <form method="get" className="flex flex-col gap-3 sm:flex-row">
        <div className="relative flex-1">
          <SearchIcon className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            name="q"
            defaultValue={q}
            placeholder="e.g. halo-lit concrete monument with a board-formed base"
            className="pl-9"
            autoFocus
          />
        </div>
        <select
          name="category"
          defaultValue={category}
          className="h-9 rounded-md border border-input bg-background px-3 text-sm"
        >
          <option value="">All categories</option>
          {facets.sign_category.map((c) => (
            <option key={c} value={c}>
              {c.replaceAll('_', ' ')}
            </option>
          ))}
        </select>
        <Button type="submit">Search</Button>
      </form>

      <SavedQueries saved={saved} currentQ={q} currentCategory={category} />

      {q ? (
        results.length ? (
          <>
            <p className="text-sm text-muted-foreground">
              {results.length} result{results.length === 1 ? '' : 's'} for “{q}”
            </p>
            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
              {results.map((r) => (
                <RecordCard key={r.record_id} data={r} />
              ))}
            </div>
          </>
        ) : (
          <p className="text-sm text-muted-foreground">No matches for “{q}”.</p>
        )
      ) : (
        <p className="text-sm text-muted-foreground">Enter a query to search the knowledge base.</p>
      )}
    </div>
  );
}
