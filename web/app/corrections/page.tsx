import { redirect } from 'next/navigation';
import { listCorrections } from '@/lib/kb';
import { currentAppUser, roleAtLeast } from '@/lib/auth';
import { NotAuthorized } from '@/components/not-authorized';
import { CorrectionsUI } from '@/components/corrections-ui';
import { RevertButton } from '@/components/revert-button';
import { Card } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';

export const dynamic = 'force-dynamic';

const statusVariant: Record<string, 'default' | 'secondary' | 'outline' | 'destructive'> = {
  approved: 'default',
  proposed: 'secondary',
  rejected: 'destructive',
  reverted: 'outline',
};

export default async function CorrectionsPage() {
  const me = await currentAppUser();
  if (!me) redirect('/login');
  if (!roleAtLeast(me.role, 'admin')) return <NotAuthorized required="admin" have={me.role} />;
  const rows = await listCorrections();

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-xl font-semibold tracking-tight">Corrections</h1>
        <p className="text-sm text-muted-foreground">
          Propose a fix in plain language. It produces a reviewable diff, re-validates the affected records, and on
          approval commits + runs the eval suite — auto-reverting if anything regresses. Every commit keeps an audit row
          and a one-click revert.
        </p>
      </div>

      <CorrectionsUI />

      <section className="space-y-3">
        <h2 className="text-sm font-medium text-muted-foreground">History</h2>
        {rows.length === 0 ? (
          <p className="text-sm text-muted-foreground">No corrections yet.</p>
        ) : (
          rows.map((c) => (
            <Card key={c.id} className="flex items-start justify-between gap-3 p-4">
              <div className="min-w-0">
                <div className="flex items-center gap-2">
                  <Badge variant={statusVariant[c.status] ?? 'secondary'}>{c.status}</Badge>
                  <span className="text-xs text-muted-foreground">
                    {c.change_set.length} edit{c.change_set.length === 1 ? '' : 's'}
                    {c.committed_at ? ` · committed ${new Date(c.committed_at).toLocaleString()}` : ''}
                  </span>
                </div>
                {c.prompt ? <p className="mt-1 line-clamp-2 text-sm">{c.prompt}</p> : null}
                <div className="mt-1 font-mono text-[11px] text-muted-foreground">
                  {[...new Set(c.change_set.map((e) => e.record_id))].slice(0, 4).join(', ')}
                </div>
                {c.status === 'rejected' && c.eval_result?.reasons ? (
                  <div className="mt-1 text-xs text-destructive">regression: {c.eval_result.reasons.join('; ')}</div>
                ) : null}
              </div>
              {c.status === 'approved' ? <RevertButton id={c.id} /> : null}
            </Card>
          ))
        )}
      </section>
    </div>
  );
}
