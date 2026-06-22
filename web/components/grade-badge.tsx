import { Badge } from '@/components/ui/badge';
import { cn } from '@/lib/utils';

const styles: Record<string, string> = {
  exemplary: 'bg-emerald-600 text-white border-transparent',
  strong: 'bg-emerald-500/15 text-emerald-700 dark:text-emerald-400 border-emerald-500/30',
  competent: 'bg-blue-500/15 text-blue-700 dark:text-blue-400 border-blue-500/30',
  weak: 'bg-amber-500/15 text-amber-700 dark:text-amber-400 border-amber-500/30',
  poor: 'bg-destructive/15 text-destructive border-destructive/30',
};

export function GradeBadge({ grade }: { grade: string | null | undefined }) {
  if (!grade) return <Badge variant="outline" className="text-muted-foreground">ungraded</Badge>;
  return <Badge variant="outline" className={cn(styles[grade] ?? '')}>{grade}</Badge>;
}
