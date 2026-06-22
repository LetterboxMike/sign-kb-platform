import { redirect } from 'next/navigation';
import { Download, ShieldCheck } from 'lucide-react';
import { corpusStats } from '@/lib/queries';
import { currentAppUser, roleAtLeast } from '@/lib/auth';
import { NotAuthorized } from '@/components/not-authorized';
import { UserRoles } from '@/components/user-roles';
import { listAppUsers } from './actions';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';

export const dynamic = 'force-dynamic';

export default async function AdminPage() {
  const me = await currentAppUser();
  if (!me) redirect('/login');
  if (!roleAtLeast(me.role, 'admin')) return <NotAuthorized required="admin" have={me.role} />;
  const [stats, users] = await Promise.all([corpusStats(), listAppUsers()]);

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-xl font-semibold tracking-tight">Admin</h1>
        <p className="text-sm text-muted-foreground">Export the KB and manage the platform.</p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Export</CardTitle>
          <CardDescription>Download the KB as one versioned JSON bundle — records, the reference layer, and a manifest.</CardDescription>
        </CardHeader>
        <CardContent className="flex flex-wrap gap-2">
          <Button asChild>
            <a href="/api/export" download>
              <Download className="h-4 w-4" /> Export live KB ({stats.signs} records)
            </a>
          </Button>
          <Button asChild variant="outline">
            <a href="/api/export?all=1" download>
              <Download className="h-4 w-4" /> Export all (incl. staging/rejected)
            </a>
          </Button>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Corpus</CardTitle>
        </CardHeader>
        <CardContent>
          <dl className="grid grid-cols-2 gap-4 sm:grid-cols-4 text-sm">
            <div><dt className="text-xs text-muted-foreground">Live records</dt><dd className="text-lg font-semibold tabular-nums">{stats.signs}</dd></div>
            <div><dt className="text-xs text-muted-foreground">Graded</dt><dd className="text-lg font-semibold tabular-nums">{stats.graded}</dd></div>
            <div><dt className="text-xs text-muted-foreground">Categories</dt><dd className="text-lg font-semibold tabular-nums">{stats.categories}</dd></div>
            <div><dt className="text-xs text-muted-foreground">Reference entries</dt><dd className="text-lg font-semibold tabular-nums">{stats.references}</dd></div>
          </dl>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <ShieldCheck className="h-4 w-4" /> Users &amp; roles
          </CardTitle>
          <CardDescription>
            <span className="font-medium">viewer</span> reads · <span className="font-medium">contributor</span> uploads,
            proposes, and grades · <span className="font-medium">admin</span> approves, governs, and exports. Rows appear
            once a user signs in; the project owner is bootstrapped to admin.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <UserRoles users={users} currentUserId={me.id} />
        </CardContent>
      </Card>
    </div>
  );
}
