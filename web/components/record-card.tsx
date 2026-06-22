import Link from 'next/link';
import { Card } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { GradeBadge } from '@/components/grade-badge';

export interface RecordCardData {
  record_id: string;
  record_type?: string | null;
  sign_category?: string | null;
  sub_type?: string | null;
  illumination_method?: string | null;
  quality_grade?: string | null;
  raw?: any;
  snippet?: string | null;
}

/** Compact result card used by search and browse. Click-through to the record detail. */
export function RecordCard({ data }: { data: RecordCardData }) {
  const summary = data.snippet ?? data.raw?.knowledge?.plain_language_summary ?? null;
  return (
    <Link href={`/record/${encodeURIComponent(data.record_id)}`} className="block">
      <Card className="h-full p-4 transition-colors hover:border-ring hover:bg-accent/40">
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <div className="truncate font-mono text-xs text-muted-foreground">{data.record_id}</div>
            <div className="mt-1 font-medium capitalize">
              {(data.sign_category ?? data.record_type ?? 'record')?.replaceAll('_', ' ')}
              {data.sub_type ? <span className="text-muted-foreground"> · {data.sub_type.replaceAll('_', ' ')}</span> : null}
            </div>
          </div>
          <GradeBadge grade={data.quality_grade} />
        </div>
        {summary ? <p className="mt-2 line-clamp-3 text-sm text-muted-foreground">{summary}</p> : null}
        <div className="mt-3 flex flex-wrap gap-1.5">
          {data.record_type ? <Badge variant="secondary">{data.record_type.replaceAll('_', ' ')}</Badge> : null}
          {data.illumination_method && data.illumination_method !== 'non_illuminated' ? (
            <Badge variant="outline">{data.illumination_method.replaceAll('_', ' ')}</Badge>
          ) : null}
        </div>
      </Card>
    </Link>
  );
}
