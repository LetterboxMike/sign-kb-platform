import type { Metadata } from 'next';
import Link from 'next/link';
import { Outfit } from 'next/font/google';
import './globals.css';
import { cn } from '@/lib/utils';
import { Nav } from '@/components/nav';
import { ThemeProvider } from '@/components/theme-provider';
import { ThemeToggle } from '@/components/theme-toggle';

const outfit = Outfit({ subsets: ['latin'], variable: '--font-sans' });

export const metadata: Metadata = {
  title: 'Sign KB Platform',
  description: 'Operator console for the Sign Knowledge Base — search, browse, chat, and grade.',
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" suppressHydrationWarning className={cn('font-sans', outfit.variable)}>
      <body className="min-h-screen antialiased">
        <ThemeProvider attribute="class" defaultTheme="system" enableSystem disableTransitionOnChange>
          <header className="sticky top-0 z-20 border-b bg-background/80 backdrop-blur">
            <div className="mx-auto flex h-14 max-w-6xl items-center justify-between gap-4 px-4">
              <Link href="/" className="whitespace-nowrap font-semibold tracking-tight">
                Sign KB <span className="font-normal text-muted-foreground">Platform</span>
              </Link>
              <div className="flex items-center gap-1">
                <Nav />
                <ThemeToggle />
              </div>
            </div>
          </header>
          <main className="mx-auto max-w-6xl px-4 py-8">{children}</main>
        </ThemeProvider>
      </body>
    </html>
  );
}
