'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { Search, List, MessageSquare, Scale, Inbox, UploadCloud } from 'lucide-react';
import { cn } from '@/lib/utils';

const links = [
  { href: '/search', label: 'Search', icon: Search },
  { href: '/browse', label: 'Browse', icon: List },
  { href: '/chat', label: 'Chat', icon: MessageSquare },
  { href: '/ranker', label: 'Ranker', icon: Scale },
  { href: '/ingest', label: 'Ingest', icon: UploadCloud },
  { href: '/review', label: 'Review', icon: Inbox },
];

export function Nav() {
  const pathname = usePathname();
  return (
    <nav className="flex items-center gap-1">
      {links.map(({ href, label, icon: Icon }) => {
        const active = pathname === href || pathname.startsWith(`${href}/`);
        return (
          <Link
            key={href}
            href={href}
            className={cn(
              'inline-flex items-center gap-2 rounded-md px-3 py-1.5 text-sm font-medium transition-colors',
              active
                ? 'bg-secondary text-secondary-foreground'
                : 'text-muted-foreground hover:bg-accent hover:text-foreground',
            )}
          >
            <Icon className="h-4 w-4" />
            <span className="hidden sm:inline">{label}</span>
          </Link>
        );
      })}
    </nav>
  );
}
