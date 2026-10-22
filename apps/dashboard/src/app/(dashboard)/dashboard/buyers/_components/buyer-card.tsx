'use client';

import Link from 'next/link';
import { Mail, MapPin, Clock, UserRound } from 'lucide-react';
import { Card, CardContent } from '@/components/ui/card';
import { cn } from '@/lib/utils';
import { useBuyerText } from '../_i18n/use-buyer-text';
import { buyerName, daysSince, type BuyerListItem } from '../use-buyers';
import { BuyerAvatar, HotBadge, PriorityStars, StageBadge } from './buyer-bits';

export function BuyerCard({ buyer, staleDays }: { buyer: BuyerListItem; staleDays: number }) {
  const t = useBuyerText();
  const name = buyerName(buyer);
  const days = daysSince(buyer.lastActivityAt);
  const stale = buyer.stage?.kind !== 'won' && buyer.stage?.kind !== 'lost' && days !== null && days >= staleDays;

  return (
    <Link href={`/dashboard/buyers/${buyer.id}`} className="block">
      <Card className="h-full border-border/60 transition-all duration-200 hover:shadow-card-hover">
        <CardContent className="space-y-3 p-4">
          <div className="flex items-start gap-3">
            <BuyerAvatar name={name} photoUrl={buyer.photoUrl} />
            <div className="min-w-0 flex-1">
              <p className="truncate font-medium">{name}</p>
              <p className="truncate text-xs text-muted-foreground">{t.roles[buyer.role] ?? buyer.role}</p>
            </div>
            <PriorityStars value={buyer.priority} />
          </div>

          <div className="space-y-1 text-xs text-muted-foreground">
            {buyer.contact?.email ? (
              <p className="flex items-center gap-1.5 truncate">
                <Mail className="h-3 w-3 shrink-0" />
                <span className="truncate">{buyer.contact.email}</span>
              </p>
            ) : null}
            {buyer.country ? (
              <p className="flex items-center gap-1.5">
                <MapPin className="h-3 w-3 shrink-0" />
                {buyer.country.toUpperCase()}
              </p>
            ) : null}
            <p className="flex items-center gap-1.5 truncate">
              <UserRound className="h-3 w-3 shrink-0" />
              <span className="truncate">{buyer.assignedToUser?.name || buyer.assignedToUser?.email || t.unassigned}</span>
            </p>
          </div>

          <div className="flex items-center justify-between border-t pt-3">
            <span className="flex items-center gap-1.5">
              <StageBadge stage={buyer.stage} />
              <HotBadge hot={buyer.hot} title={t.hotTitle} />
            </span>
            <span className={cn('flex items-center gap-1 text-[11px]', stale ? 'font-medium text-amber-600' : 'text-muted-foreground')}>
              <Clock className="h-3 w-3" />
              {days === null ? t.never : t.daysAgo(days)}
            </span>
          </div>
        </CardContent>
      </Card>
    </Link>
  );
}
