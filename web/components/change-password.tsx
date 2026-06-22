'use client';

import { useState } from 'react';
import { Loader2, Check } from 'lucide-react';
import { createClient } from '@/lib/supabase/client';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';

export function ChangePassword() {
  const [password, setPassword] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState(false);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (busy) return;
    if (password.length < 8) {
      setError('Use at least 8 characters.');
      return;
    }
    setBusy(true);
    setError(null);
    setDone(false);
    const { error } = await createClient().auth.updateUser({ password });
    if (error) setError(error.message);
    else {
      setDone(true);
      setPassword('');
    }
    setBusy(false);
  }

  return (
    <form onSubmit={submit} className="space-y-3">
      <Input type="password" value={password} onChange={(e) => setPassword(e.target.value)} placeholder="new password" autoComplete="new-password" className="max-w-xs" />
      {error ? <p className="text-sm text-destructive">{error}</p> : null}
      {done ? <p className="flex items-center gap-1 text-sm text-emerald-600 dark:text-emerald-400"><Check className="h-4 w-4" /> Password updated.</p> : null}
      <Button type="submit" disabled={busy}>
        {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : null} Update password
      </Button>
    </form>
  );
}
