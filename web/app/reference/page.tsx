import { Search as SearchIcon } from 'lucide-react';
import { listReference } from '@/lib/kb';
import { ReferenceAdd } from '@/components/reference-add';
import { Card } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';

export const dynamic = 'force-dynamic';

export default async function ReferencePage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const sp = await searchParams;
  const q = (sp.q ?? '').toString();
  const entries = await listReference({ search: q });

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-xl font-semibold tracking-tight">Reference</h1>
        <p className="text-sm text-muted-foreground">
          The manufacturer/material knowledge layer — resolved onto records&apos; materials. Research and add entries, or
          browse what&apos;s here.
        </p>
      </div>

      <ReferenceAdd />

      <form method="get" className="flex gap-2">
        <div className="relative flex-1">
          <SearchIcon className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input name="q" defaultValue={q} placeholder="Filter by company, product, category, or id" className="pl-9" />
        </div>
        <Button type="submit">Filter</Button>
      </form>

      <p className="text-sm text-muted-foreground">{entries.length} entr{entries.length === 1 ? 'y' : 'ies'}</p>
      <div className="grid gap-3 sm:grid-cols-2">
        {entries.map((e) => (
          <Card key={e.normalized_id} className="p-4">
            <div className="flex items-start justify-between gap-2">
              <div className="min-w-0">
                <div className="truncate font-medium">{e.company ?? e.product ?? e.normalized_id}</div>
                <div className="truncate font-mono text-[11px] text-muted-foreground">{e.normalized_id}</div>
              </div>
              <div className="flex shrink-0 gap-1">
                {e.category ? <Badge variant="secondary">{e.category}</Badge> : null}
                <Badge variant="outline">{e.depth}</Badge>
              </div>
            </div>
            {e.knowledge ? <p className="mt-2 line-clamp-3 text-sm text-muted-foreground">{e.knowledge}</p> : null}
          </Card>
        ))}
      </div>
    </div>
  );
}
