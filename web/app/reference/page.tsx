import { Search as SearchIcon } from 'lucide-react';
import { listReference } from '@/lib/kb';
import { currentAppUser, roleAtLeast } from '@/lib/auth';
import { ReferenceAdd } from '@/components/reference-add';
import { ReferenceCard } from '@/components/reference-card';
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
  const me = await currentAppUser();
  const canResearch = me ? roleAtLeast(me.role, 'contributor') : false;
  const canPublish = me ? roleAtLeast(me.role, 'admin') : false;
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

      {canResearch ? <ReferenceAdd canPublish={canPublish} /> : null}

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
          <ReferenceCard key={e.normalized_id} entry={e} />
        ))}
      </div>
    </div>
  );
}
