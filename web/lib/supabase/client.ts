import { createBrowserClient } from '@supabase/ssr';

// Browser Supabase client — used only for Auth (sign in / out / password). Data access stays
// server-side through the query API; the anon/publishable key never reads tables directly.
export function createClient() {
  return createBrowserClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!);
}
