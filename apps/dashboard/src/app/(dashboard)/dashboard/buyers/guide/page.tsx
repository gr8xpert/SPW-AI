'use client';

import { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { AlertTriangle, ArrowRight, ArrowUp, BookOpen, Lightbulb, Rocket, Search, X } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { LockedRouteGuard } from '@/components/locked-route-guard';
import { cn } from '@/lib/utils';
import { useBuyerText } from '../_i18n/use-buyer-text';
import { BuyersNav } from '../_components/buyers-nav';
import { BASICS } from './guide-basics';
import { MORE, QUICK_LINKS } from './guide-more';
import { sectionText, type GuideBlock, type GuideSection } from './guide-types';

const SECTIONS: GuideSection[] = [...BASICS, ...MORE];
const GROUPS = Array.from(new Set(SECTIONS.map((s) => s.group)));
const SEARCH_TEXT = new Map(SECTIONS.map((s) => [s.id, sectionText(s)]));

function Block({ block }: { block: GuideBlock }) {
  switch (block.kind) {
    case 'p':
      return <p className="leading-relaxed text-foreground/90">{block.text}</p>;
    case 'steps':
      return (
        <ol className="space-y-3">
          {block.items.map((item, i) => (
            <li key={i} className="flex gap-3">
              <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-primary text-xs font-semibold text-primary-foreground">
                {i + 1}
              </span>
              <span className="pt-0.5 leading-relaxed">{item}</span>
            </li>
          ))}
        </ol>
      );
    case 'terms':
      return (
        <dl className="grid gap-3 md:grid-cols-2">
          {block.items.map(([term, meaning]) => (
            <div key={term} className="rounded-lg border bg-muted/40 p-3">
              <dt className="font-medium">{term}</dt>
              <dd className="mt-1 text-sm leading-relaxed text-muted-foreground">{meaning}</dd>
            </div>
          ))}
        </dl>
      );
    case 'tip':
      return (
        <div className="flex gap-3 rounded-lg border border-emerald-200 bg-emerald-50 p-3 text-sm text-emerald-900 dark:border-emerald-900 dark:bg-emerald-950/40 dark:text-emerald-200">
          <Lightbulb className="mt-0.5 h-4 w-4 shrink-0" />
          <p className="leading-relaxed"><span className="font-semibold">Tip: </span>{block.text}</p>
        </div>
      );
    case 'warn':
      return (
        <div className="flex gap-3 rounded-lg border border-amber-200 bg-amber-50 p-3 text-sm text-amber-900 dark:border-amber-900 dark:bg-amber-950/40 dark:text-amber-200">
          <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
          <p className="leading-relaxed"><span className="font-semibold">Watch out: </span>{block.text}</p>
        </div>
      );
  }
}

function Section({ section }: { section: GuideSection }) {
  const Icon = section.icon;
  return (
    <Card id={section.id} className="scroll-mt-24" data-testid={`guide-${section.id}`}>
      <CardContent className="space-y-4 p-6">
        <div className="flex items-start gap-4">
          <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-primary/10 text-primary">
            <Icon className="h-5 w-5" />
          </div>
          <div className="min-w-0 flex-1">
            <div className="flex flex-wrap items-center gap-2">
              <h3 className="text-lg font-semibold">{section.title}</h3>
              {section.managersOnly ? (
                <span className="rounded-full border px-2 py-0.5 text-[11px] font-medium text-muted-foreground">Managers</span>
              ) : null}
            </div>
            <p className="mt-0.5 text-sm text-muted-foreground">{section.summary}</p>
          </div>
        </div>
        <div className="space-y-4 text-sm">
          {section.blocks.map((b, i) => (
            <Block key={i} block={b} />
          ))}
        </div>
        {section.link ? (
          <Button variant="outline" size="sm" asChild>
            <Link href={section.link.href}>
              {section.link.label}
              <ArrowRight className="ml-1.5 h-3.5 w-3.5" />
            </Link>
          </Button>
        ) : null}
      </CardContent>
    </Card>
  );
}

// The Buyer Match guide: every feature in plain words, searchable, with a
// contents list that follows the reader.
function GuideInner() {
  const [query, setQuery] = useState('');
  const [active, setActive] = useState(SECTIONS[0].id);

  const shown = useMemo(() => {
    const words = query.trim().toLowerCase().split(/\s+/).filter(Boolean);
    return words.length ? SECTIONS.filter((s) => words.every((w) => SEARCH_TEXT.get(s.id)!.includes(w))) : SECTIONS;
  }, [query]);

  // Highlight the section being read in the contents list.
  useEffect(() => {
    const seen = new Map<string, boolean>();
    const observer = new IntersectionObserver(
      (entries) => {
        for (const e of entries) seen.set(e.target.id, e.isIntersecting);
        const first = shown.find((s) => seen.get(s.id));
        if (first) setActive(first.id);
      },
      { rootMargin: '-80px 0px -60% 0px' },
    );
    for (const s of shown) {
      const el = document.getElementById(s.id);
      if (el) observer.observe(el);
    }
    return () => observer.disconnect();
  }, [shown]);

  const jump = (id: string) => {
    document.getElementById(id)?.scrollIntoView({ behavior: 'smooth', block: 'start' });
    setActive(id);
  };

  return (
    <div className="space-y-6">
      <div className="page-header animate-fade-in">
        <div>
          <h1 className="page-title">Buyer Match guide</h1>
          <p className="page-description mt-1">Everything about Buyers, explained in plain words.</p>
        </div>
      </div>

      <BuyersNav />

      <Card className="overflow-hidden border-primary/20 bg-gradient-to-br from-primary/10 via-background to-background">
        <CardContent className="grid gap-6 p-6 md:grid-cols-[1fr_auto] md:items-center">
          <div className="space-y-4">
            <div className="flex items-center gap-3">
              <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-primary text-primary-foreground shadow-sm">
                <BookOpen className="h-6 w-6" />
              </div>
              <div>
                <p className="text-lg font-semibold">New here? Start with the quick start.</p>
                <p className="text-sm text-muted-foreground">{SECTIONS.length} short topics. Five minutes is enough to send your first email.</p>
              </div>
            </div>
            <div className="relative max-w-xl">
              <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
              <Input
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder="Search the guide, e.g. wishlist, alerts, erase…"
                className="h-11 bg-background pl-9 pr-9"
                data-testid="guide-search"
              />
              {query ? (
                <button type="button" aria-label="Clear search" className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground" onClick={() => setQuery('')}>
                  <X className="h-4 w-4" />
                </button>
              ) : null}
            </div>
          </div>
          <div className="flex flex-col gap-2">
            <Button onClick={() => { setQuery(''); setTimeout(() => jump('quick-start'), 0); }}>
              <Rocket className="mr-2 h-4 w-4" />
              Quick start
            </Button>
            <div className="grid grid-cols-2 gap-2">
              {QUICK_LINKS.map(({ href, label, icon: Icon }) => (
                <Button key={href} variant="outline" size="sm" className="justify-start bg-background" asChild>
                  <Link href={href}>
                    <Icon className="mr-1.5 h-3.5 w-3.5" />
                    {label}
                  </Link>
                </Button>
              ))}
            </div>
          </div>
        </CardContent>
      </Card>

      <div className="grid gap-6 lg:grid-cols-[240px_1fr]">
        <aside className="hidden lg:block">
          <nav className="sticky top-20 max-h-[calc(100vh-6rem)] space-y-5 overflow-y-auto pr-2 text-sm" aria-label="Guide contents">
            {GROUPS.map((g) => {
              const items = shown.filter((s) => s.group === g);
              if (!items.length) return null;
              return (
                <div key={g}>
                  <p className="mb-1.5 px-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">{g}</p>
                  <ul className="space-y-0.5">
                    {items.map((s) => (
                      <li key={s.id}>
                        <button
                          type="button"
                          onClick={() => jump(s.id)}
                          className={cn(
                            'w-full rounded-md px-2 py-1.5 text-left transition-colors',
                            active === s.id ? 'bg-primary/10 font-medium text-primary' : 'text-muted-foreground hover:bg-muted hover:text-foreground',
                          )}
                        >
                          {s.title}
                        </button>
                      </li>
                    ))}
                  </ul>
                </div>
              );
            })}
          </nav>
        </aside>

        <div className="min-w-0 space-y-8">
          {shown.length === 0 ? (
            <Card>
              <CardContent className="py-12 text-center text-sm text-muted-foreground">
                Nothing in the guide matches “{query}”. Try another word, like “email” or “stage”.
              </CardContent>
            </Card>
          ) : (
            GROUPS.map((g) => {
              const items = shown.filter((s) => s.group === g);
              if (!items.length) return null;
              return (
                <section key={g} className="space-y-4">
                  <h2 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">{g}</h2>
                  {items.map((s) => (
                    <Section key={s.id} section={s} />
                  ))}
                </section>
              );
            })
          )}
          <div className="flex justify-center pb-4">
            <Button variant="ghost" size="sm" onClick={() => window.scrollTo({ top: 0, behavior: 'smooth' })}>
              <ArrowUp className="mr-1.5 h-4 w-4" />
              Back to top
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
}

export default function BuyerGuidePage() {
  const t = useBuyerText();
  return (
    <LockedRouteGuard addon="buyerMatch" featureName={t.featureName} description={t.featureDescription}>
      <GuideInner />
    </LockedRouteGuard>
  );
}
