'use client';

import { useRouter } from 'next/navigation';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { cn } from '@/lib/utils';
import { useBuyerText } from '../_i18n/use-buyer-text';
import { buyerName, daysSince, type BuyerListItem } from '../use-buyers';
import { BuyerAvatar, HotBadge, PriorityStars, StageBadge } from './buyer-bits';

export function BuyerTable({ buyers, staleDays }: { buyers: BuyerListItem[]; staleDays: number }) {
  const t = useBuyerText();
  const router = useRouter();
  return (
    <div className="overflow-x-auto rounded-md border">
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>{t.columns.name}</TableHead>
            <TableHead>{t.columns.email}</TableHead>
            <TableHead>{t.columns.phone}</TableHead>
            <TableHead>{t.columns.role}</TableHead>
            <TableHead>{t.columns.stage}</TableHead>
            <TableHead>{t.columns.agent}</TableHead>
            <TableHead>{t.columns.priority}</TableHead>
            <TableHead className="text-right">{t.columns.lastActivity}</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {buyers.map((b) => {
            const name = buyerName(b);
            const days = daysSince(b.lastActivityAt);
            const stale = b.stage?.kind === 'open' && days !== null && days >= staleDays;
            return (
              <TableRow key={b.id} className="cursor-pointer" onClick={() => router.push(`/dashboard/buyers/${b.id}`)}>
                <TableCell>
                  <div className="flex items-center gap-2">
                    <BuyerAvatar name={name} photoUrl={b.photoUrl} className="h-7 w-7" />
                    <span className="font-medium">{name}</span>
                    <HotBadge hot={b.hot} title={t.hotTitle} />
                  </div>
                </TableCell>
                <TableCell className="text-muted-foreground">{b.contact?.email}</TableCell>
                <TableCell className="text-muted-foreground">{b.mobile || b.phone || ''}</TableCell>
                <TableCell>{t.roles[b.role] ?? b.role}</TableCell>
                <TableCell><StageBadge stage={b.stage} /></TableCell>
                <TableCell className="text-muted-foreground">{b.assignedToUser?.name || b.assignedToUser?.email || t.unassigned}</TableCell>
                <TableCell><PriorityStars value={b.priority} /></TableCell>
                <TableCell className={cn('text-right text-xs', stale ? 'font-medium text-amber-600' : 'text-muted-foreground')}>
                  {days === null ? t.never : t.daysAgo(days)}
                </TableCell>
              </TableRow>
            );
          })}
        </TableBody>
      </Table>
    </div>
  );
}
