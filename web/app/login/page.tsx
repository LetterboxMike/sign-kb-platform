'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { Loader2 } from 'lucide-react';
import { createClient } from '@/lib/supabase/client';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';

export default function LoginPage() {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [info, setInfo] = useState<string | null>(null);
  const router = useRouter();

  async function signIn(e: React.FormEvent) {
    e.preventDefault();
    if (busy) return;
    setBusy(true);
    setError(null);
    setInfo(null);
    const supabase = createClient();
    const { error } = await supabase.auth.signInWithPassword({ email: email.trim(), password });
    if (error) {
      setError(error.message);
      setBusy(false);
      return;
    }
    const next = new URLSearchParams(window.location.search).get('next') || '/';
    router.push(next.startsWith('/') ? next : '/');
    router.refresh();
  }

  async function forgotPassword() {
    if (!email.trim()) {
      setError('Enter your email first, then click “Forgot password”.');
      return;
    }
    setError(null);
    const supabase = createClient();
    const { error } = await supabase.auth.resetPasswordForEmail(email.trim(), {
      redirectTo: `${window.location.origin}/reset-password`,
    });
    if (error) setError(error.message);
    else setInfo('If that email has an account, a password-reset link is on its way.');
  }

  return (
    <div className="mx-auto flex min-h-[70vh] max-w-sm items-center">
      <Card className="w-full">
        <CardHeader>
          <CardTitle>Sign in</CardTitle>
          <CardDescription>Sign KB Platform</CardDescription>
        </CardHeader>
        <CardContent>
          <form onSubmit={signIn} className="space-y-3">
            <Input type="email" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="email" autoComplete="email" required />
            <Input type="password" value={password} onChange={(e) => setPassword(e.target.value)} placeholder="password" autoComplete="current-password" required />
            {error ? <p className="text-sm text-destructive">{error}</p> : null}
            {info ? <p className="text-sm text-emerald-600 dark:text-emerald-400">{info}</p> : null}
            <Button type="submit" className="w-full" disabled={busy}>
              {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : null} Sign in
            </Button>
            <button type="button" onClick={forgotPassword} className="text-xs text-muted-foreground underline-offset-2 hover:underline">
              Forgot password?
            </button>
          </form>
        </CardContent>
      </Card>
    </div>
  );
}
