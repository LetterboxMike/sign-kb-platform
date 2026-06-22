import Link from 'next/link';
import { ChevronRight } from 'lucide-react';
import { Card } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import type { ReferenceLayerEntry } from '@/lib/kb';

/** Compact, click-through reference entry card. Mirrors the record-card Link pattern so the
 *  manufacturer/material layer is browsable to a detail view, not a dead grid. */
export function ReferenceCard({ entry }: { entry: ReferenceLayerEntry }) {
  return (
    <Link href={`/reference/${encodeURIComponent(entry.normalized_id)}`} className="block">
      <Card className="h-full p-4 transition-colors hover:border-ring hover:bg-accent/40">
        <div className="flex items-start justify-between gap-2">
          <div className="min-w-0">
            <div className="truncate font-medium">{entry.company ?? entry.product ?? entry.normalized_id}</div>
            <div className="truncate font-mono text-[11px] text-muted-foreground">{entry.normalized_id}</div>
          </div>
          <div className="flex shrink-0 items-center gap-1">
            {entry.category ? <Badge variant="secondary">{entry.category}</Badge> : null}
            <Badge variant="outline">{entry.depth}</Badge>
            <ChevronRight className="h-4 w-4 text-muted-foreground" />
          </div>
        </div>
        {entry.knowledge ? <p className="mt-2 line-clamp-3 text-sm text-muted-foreground">{entry.knowledge}</p> : null}
      </Card>
    </Link>
  );
}
