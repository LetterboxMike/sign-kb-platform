'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { Search, List, MessageSquare, Scale, Inbox, UploadCloud, Wand2, Library, Tags, Settings } from 'lucide-react';
import { cn } from '@/lib/utils';
import type { Role } from '@/lib/auth';

const RANK: Record<Role, number> = { viewer: 0, contributor: 1, admin: 2 };

// Each link declares the minimum role that can use it. Read surfaces are viewer-visible; write
// surfaces need contributor; governance/approval surfaces need admin.
const links: { href: string; label: string; icon: typeof Search; min: Role }[] = [
  { href: '/search', label: 'Search', icon: Search, min: 'viewer' },
  { href: '/browse', label: 'Browse', icon: List, min: 'viewer' },
  { href: '/chat', label: 'Chat', icon: MessageSquare, min: 'viewer' },
  { href: '/reference', label: 'Reference', icon: Library, min: 'viewer' },
  { href: '/ranker', label: 'Ranker', icon: Scale, min: 'contributor' },
  { href: '/ingest', label: 'Ingest', icon: UploadCloud, min: 'contributor' },
  { href: '/review', label: 'Review', icon: Inbox, min: 'admin' },
  { href: '/corrections', label: 'Corrections', icon: Wand2, min: 'admin' },
  { href: '/vocab', label: 'Vocab', icon: Tags, min: 'admin' },
  { href: '/admin', label: 'Admin', icon: Settings, min: 'admin' },
];

export function Nav({ role = 'viewer' }: { role?: Role }) {
  const pathname = usePathname();
  return (
    <nav className="flex items-center gap-1">
      {links
        .filter((l) => RANK[role] >= RANK[l.min])
        .map(({ href, label, icon: Icon }) => {
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
            <span className="hidden lg:inline">{label}</span>
          </Link>
        );
      })}
    </nav>
  );
}
