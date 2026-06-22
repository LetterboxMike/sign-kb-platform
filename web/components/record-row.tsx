import Link from 'next/link';
import { ChevronRight } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { GradeBadge } from '@/components/grade-badge';
import type { RecordCardData } from '@/components/record-card';

/** Compact one-line variant of the record card for Browse's list view. */
export function RecordRow({ data }: { data: RecordCardData }) {
  const summary = data.snippet ?? data.raw?.knowledge?.plain_language_summary ?? null;
  return (
    <Link
      href={`/record/${encodeURIComponent(data.record_id)}`}
      className="flex items-center gap-3 rounded-md border px-3 py-2 transition-colors hover:border-ring hover:bg-accent/40"
    >
      <div className="min-w-0 flex-1">
        <div className="flex flex-wrap items-center gap-2">
          <span className="font-medium capitalize">
            {(data.sign_category ?? data.record_type ?? 'record')?.replaceAll('_', ' ')}
          </span>
          {data.sub_type ? <span className="text-sm text-muted-foreground">· {data.sub_type.replaceAll('_', ' ')}</span> : null}
          {data.record_type ? <Badge variant="secondary">{data.record_type.replaceAll('_', ' ')}</Badge> : null}
          {data.illumination_method && data.illumination_method !== 'non_illuminated' ? (
            <Badge variant="outline">{data.illumination_method.replaceAll('_', ' ')}</Badge>
          ) : null}
        </div>
        {summary ? <p className="mt-0.5 truncate text-xs text-muted-foreground">{summary}</p> : null}
      </div>
      <span className="hidden font-mono text-[11px] text-muted-foreground sm:inline">{data.record_id}</span>
      <GradeBadge grade={data.quality_grade} />
      <ChevronRight className="h-4 w-4 shrink-0 text-muted-foreground" />
    </Link>
  );
}
