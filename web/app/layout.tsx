import type { Metadata } from 'next';
import Link from 'next/link';
import { Inter } from 'next/font/google';
import './globals.css';
import { cn } from '@/lib/utils';
import { Nav } from '@/components/nav';
import { ThemeProvider } from '@/components/theme-provider';
import { ThemeToggle } from '@/components/theme-toggle';
import { UserMenu } from '@/components/user-menu';
import { createClient } from '@/lib/supabase/server';

const inter = Inter({ subsets: ['latin'], variable: '--font-sans' });

export const metadata: Metadata = {
  title: 'Sign KB Platform',
  description: 'Operator console for the Sign Knowledge Base — search, browse, chat, and grade.',
};

export default async function RootLayout({ children }: { children: React.ReactNode }) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();

  return (
    <html lang="en" suppressHydrationWarning className={cn('font-sans', inter.variable)}>
      <body className="min-h-screen antialiased">
        <ThemeProvider attribute="class" defaultTheme="system" enableSystem disableTransitionOnChange>
          {user ? (
            <header className="sticky top-0 z-20 border-b bg-background/80 backdrop-blur">
              <div className="mx-auto flex h-14 max-w-6xl items-center justify-between gap-4 px-4">
                <Link href="/" className="whitespace-nowrap font-semibold tracking-tight">
                  Sign KB <span className="font-normal text-muted-foreground">Platform</span>
                </Link>
                <div className="flex items-center gap-1">
                  <Nav />
                  <ThemeToggle />
                  <UserMenu email={user.email ?? ''} />
                </div>
              </div>
            </header>
          ) : null}
          <main className="mx-auto max-w-6xl px-4 py-8">{children}</main>
        </ThemeProvider>
      </body>
    </html>
  );
}
