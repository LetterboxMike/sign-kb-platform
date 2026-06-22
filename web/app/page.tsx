import Link from 'next/link';
import { Search, List, MessageSquare, Scale } from 'lucide-react';
import { corpusStats, gradeDistribution } from '@/lib/queries';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';

export const dynamic = 'force-dynamic';

const tiles = [
  { href: '/search', title: 'Search', desc: 'Semantic + faceted search over the corpus', icon: Search },
  { href: '/browse', title: 'Browse', desc: 'Filter and page through every record', icon: List },
  { href: '/chat', title: 'Chat', desc: 'Ask the KB; answers cite the records used', icon: MessageSquare },
  { href: '/ranker', title: 'Ranker', desc: 'Grade design quality by pairwise comparison', icon: Scale },
];

export default async function Home() {
  const [stats, dist] = await Promise.all([corpusStats(), gradeDistribution()]);
  const total = dist.reduce((s, d) => s + d.n, 0) || 1;

  return (
    <div className="space-y-10">
      <section>
        <h1 className="text-2xl font-semibold tracking-tight">Sign Knowledge Base</h1>
        <p className="mt-1 text-muted-foreground">
          The operator console over the live KB — search, verify, interrogate, and grade.
        </p>
        <div className="mt-5 grid grid-cols-2 gap-3 sm:grid-cols-4">
          {[
            { label: 'Live records', value: stats.signs },
            { label: 'Graded', value: stats.graded },
            { label: 'Categories', value: stats.categories },
            { label: 'Reference entries', value: stats.references },
          ].map((s) => (
            <Card key={s.label} className="p-4">
              <div className="text-2xl font-semibold tabular-nums">{s.value}</div>
              <div className="text-xs text-muted-foreground">{s.label}</div>
            </Card>
          ))}
        </div>
      </section>

      <section className="grid gap-4 sm:grid-cols-2">
        {tiles.map(({ href, title, desc, icon: Icon }) => (
          <Link key={href} href={href}>
            <Card className="h-full transition-colors hover:border-ring hover:bg-accent/40">
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <Icon className="h-4 w-4" /> {title}
                </CardTitle>
                <CardDescription>{desc}</CardDescription>
              </CardHeader>
            </Card>
          </Link>
        ))}
      </section>

      <section>
        <h2 className="mb-3 text-sm font-medium text-muted-foreground">Quality grade distribution</h2>
        <div className="flex h-3 w-full overflow-hidden rounded-full border">
          {dist.map((d) => (
            <div
              key={d.grade}
              title={`${d.grade}: ${d.n}`}
              className="h-full"
              style={{
                width: `${(d.n / total) * 100}%`,
                backgroundColor:
                  d.grade === 'ungraded'
                    ? 'hsl(var(--muted))'
                    : `hsl(${{ exemplary: 152, strong: 152, competent: 217, weak: 38, poor: 0 }[d.grade] ?? 240} 60% 50%)`,
              }}
            />
          ))}
        </div>
        <div className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-xs text-muted-foreground">
          {dist.map((d) => (
            <span key={d.grade}>
              {d.grade}: <span className="tabular-nums text-foreground">{d.n}</span>
            </span>
          ))}
        </div>
      </section>
    </div>
  );
}
