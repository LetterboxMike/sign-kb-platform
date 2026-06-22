import { redirect } from 'next/navigation';
import { UploadCloud } from 'lucide-react';
import { storageConfigured } from '@/lib/storage';
import { pendingJobCount } from '@/lib/kb';
import { currentAppUser, roleAtLeast } from '@/lib/auth';
import { NotAuthorized } from '@/components/not-authorized';
import { UploadUI } from '@/components/upload-ui';

export const dynamic = 'force-dynamic';

export default async function IngestPage() {
  const me = await currentAppUser();
  if (!me) redirect('/login');
  if (!roleAtLeast(me.role, 'contributor')) return <NotAuthorized required="contributor" have={me.role} />;
  const ok = storageConfigured();
  const pending = ok ? await pendingJobCount() : 0;
  return (
    <div className="space-y-5">
      <div>
        <h1 className="text-xl font-semibold tracking-tight">Ingest drawings</h1>
        <p className="text-sm text-muted-foreground">
          Upload sign drawings. Each is extracted into candidate records and staged for your review — nothing reaches the
          live KB until you approve it.
        </p>
      </div>
      {ok ? (
        <UploadUI initialPending={pending} />
      ) : (
        <div className="flex items-start gap-3 rounded-lg border border-dashed p-6 text-sm">
          <UploadCloud className="mt-0.5 h-5 w-5 text-muted-foreground" />
          <div>
            <p className="font-medium">Storage isn&apos;t configured yet.</p>
            <p className="mt-1 text-muted-foreground">
              Add <span className="font-mono">SUPABASE_SERVICE_ROLE_KEY</span> to the repo-root <span className="font-mono">.env</span>{' '}
              (Supabase dashboard → Project Settings → API → service_role), then restart the app. The private{' '}
              <span className="font-mono">drawings</span> bucket already exists.
            </p>
          </div>
        </div>
      )}
    </div>
  );
}
