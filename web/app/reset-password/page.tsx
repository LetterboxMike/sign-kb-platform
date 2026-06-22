'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { Loader2 } from 'lucide-react';
import { createClient } from '@/lib/supabase/client';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';

// Landed here from a password-reset email link — Supabase establishes a recovery session, so
// updateUser can set the new password.
export default function ResetPasswordPage() {
  const [password, setPassword] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState(false);
  const router = useRouter();

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (busy || password.length < 8) {
      if (password.length < 8) setError('Use at least 8 characters.');
      return;
    }
    setBusy(true);
    setError(null);
    const supabase = createClient();
    const { error } = await supabase.auth.updateUser({ password });
    if (error) {
      setError(error.message);
      setBusy(false);
      return;
    }
    setDone(true);
    setTimeout(() => {
      router.push('/');
      router.refresh();
    }, 1200);
  }

  return (
    <div className="mx-auto flex min-h-[70vh] max-w-sm items-center">
      <Card className="w-full">
        <CardHeader>
          <CardTitle>Set a new password</CardTitle>
          <CardDescription>Choose a new password for your account.</CardDescription>
        </CardHeader>
        <CardContent>
          {done ? (
            <p className="text-sm text-emerald-600 dark:text-emerald-400">Password updated. Redirecting…</p>
          ) : (
            <form onSubmit={submit} className="space-y-3">
              <Input type="password" value={password} onChange={(e) => setPassword(e.target.value)} placeholder="new password" autoComplete="new-password" required />
              {error ? <p className="text-sm text-destructive">{error}</p> : null}
              <Button type="submit" className="w-full" disabled={busy}>
                {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : null} Update password
              </Button>
            </form>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
