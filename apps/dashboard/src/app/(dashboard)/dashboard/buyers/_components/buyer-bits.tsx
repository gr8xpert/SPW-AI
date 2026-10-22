'use client';

import { Flame, Star } from 'lucide-react';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { cn, getInitials } from '@/lib/utils';
import { stageName, type BuyerStage } from '../use-buyers';

// 0–3 stars. Clicking the lit top star again clears to 0.
export function PriorityStars({
  value,
  onChange,
  size = 'sm',
}: {
  value: number;
  onChange?: (value: number) => void;
  size?: 'sm' | 'md';
}) {
  const cls = size === 'md' ? 'h-5 w-5' : 'h-3.5 w-3.5';
  return (
    <div className="flex items-center gap-0.5" aria-label={`Priority ${value} of 3`}>
      {[1, 2, 3].map((n) => {
        const lit = n <= value;
        const star = <Star className={cn(cls, lit ? 'fill-amber-400 text-amber-400' : 'text-muted-foreground/40')} />;
        return onChange ? (
          <button
            key={n}
            type="button"
            className="rounded p-0.5 hover:bg-muted"
            onClick={(e) => {
              e.preventDefault();
              e.stopPropagation();
              onChange(value === n ? n - 1 : n);
            }}
            aria-label={`${n} star${n > 1 ? 's' : ''}`}
          >
            {star}
          </button>
        ) : (
          <span key={n}>{star}</span>
        );
      })}
    </div>
  );
}

export function BuyerAvatar({ name, photoUrl, className }: { name: string; photoUrl?: string | null; className?: string }) {
  return (
    <Avatar className={cn('h-10 w-10', className)}>
      {photoUrl ? <AvatarImage src={photoUrl} alt="" /> : null}
      <AvatarFallback className="text-xs">{getInitials(name || '?')}</AvatarFallback>
    </Avatar>
  );
}

// "Hot": the buyer reacted a lot lately (see the API's hot.ts).
export function HotBadge({ hot, title }: { hot?: boolean; title: string }) {
  if (!hot) return null;
  return (
    <span
      className="inline-flex items-center gap-0.5 rounded-full bg-orange-100 px-1.5 py-0.5 text-[10px] font-semibold text-orange-700 dark:bg-orange-950 dark:text-orange-300"
      title={title}
      data-hot="1"
    >
      <Flame className="h-3 w-3" />
      Hot
    </span>
  );
}

export function StageBadge({ stage }: { stage: BuyerStage | null }) {
  if (!stage) return <span className="text-xs text-muted-foreground">—</span>;
  const color = stage.color || '#64748b';
  return (
    <span
      className="inline-flex items-center gap-1.5 rounded-full border px-2 py-0.5 text-[11px] font-medium"
      style={{ borderColor: `${color}55`, backgroundColor: `${color}14`, color }}
    >
      <span className="h-1.5 w-1.5 rounded-full" style={{ backgroundColor: color }} />
      {stageName(stage)}
    </span>
  );
}
