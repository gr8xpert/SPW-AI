'use client';

import { useState } from 'react';
import { ChevronLeft, ChevronRight, ChevronsLeft, ChevronsRight } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';

interface Props {
  page: number;
  pages: number;
  onChange: (page: number) => void;
}

// 1 … 4 5 [6] 7 8 … 220 — the first and last page, two either side of the
// current one, and a gap marker where pages are skipped.
function pageList(page: number, pages: number): Array<number | 'gap'> {
  const wanted = new Set([1, pages]);
  for (let p = page - 2; p <= page + 2; p++) if (p >= 1 && p <= pages) wanted.add(p);
  const sorted = Array.from(wanted).sort((a, b) => a - b);
  const out: Array<number | 'gap'> = [];
  sorted.forEach((p, i) => {
    if (i > 0 && p - sorted[i - 1] > 1) out.push(p - sorted[i - 1] === 2 ? p - 1 : 'gap');
    out.push(p);
  });
  return out;
}

/**
 * Page buttons for long lists: first / previous, numbered pages, next / last,
 * and a box to jump straight to any page (an 11k-listing client has 220).
 */
export function PageNumbers({ page, pages, onChange }: Props) {
  const [jump, setJump] = useState('');
  if (pages <= 1) return null;

  const go = (p: number) => {
    const target = Math.min(pages, Math.max(1, p));
    if (target !== page) onChange(target);
  };

  const submitJump = (e: React.FormEvent) => {
    e.preventDefault();
    const n = parseInt(jump, 10);
    if (Number.isFinite(n)) go(n);
    setJump('');
  };

  return (
    <div className="flex flex-wrap items-center gap-1">
      <Button variant="outline" size="icon" className="h-8 w-8" onClick={() => go(1)} disabled={page === 1} aria-label="First page">
        <ChevronsLeft className="h-4 w-4" />
      </Button>
      <Button variant="outline" size="icon" className="h-8 w-8" onClick={() => go(page - 1)} disabled={page === 1} aria-label="Previous page">
        <ChevronLeft className="h-4 w-4" />
      </Button>
      {pageList(page, pages).map((p, i) =>
        p === 'gap' ? (
          <span key={`gap-${i}`} className="px-1 text-sm text-muted-foreground">…</span>
        ) : (
          <Button
            key={p}
            variant={p === page ? 'default' : 'outline'}
            size="sm"
            className="h-8 min-w-8 px-2"
            onClick={() => go(p)}
            aria-current={p === page ? 'page' : undefined}
          >
            {p.toLocaleString()}
          </Button>
        ),
      )}
      <Button variant="outline" size="icon" className="h-8 w-8" onClick={() => go(page + 1)} disabled={page === pages} aria-label="Next page">
        <ChevronRight className="h-4 w-4" />
      </Button>
      <Button variant="outline" size="icon" className="h-8 w-8" onClick={() => go(pages)} disabled={page === pages} aria-label="Last page">
        <ChevronsRight className="h-4 w-4" />
      </Button>
      {pages > 7 && (
        <form onSubmit={submitJump} className="ml-2 flex items-center gap-1">
          <Input
            type="number"
            min={1}
            max={pages}
            value={jump}
            onChange={(e) => setJump(e.target.value)}
            placeholder="Page"
            aria-label="Go to page"
            className="h-8 w-20"
          />
          <Button type="submit" variant="outline" size="sm" className="h-8" disabled={!jump}>Go</Button>
        </form>
      )}
    </div>
  );
}
