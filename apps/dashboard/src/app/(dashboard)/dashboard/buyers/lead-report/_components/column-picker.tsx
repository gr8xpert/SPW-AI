'use client';

import Link from 'next/link';
import { Columns3 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import {
  DropdownMenu, DropdownMenuCheckboxItem, DropdownMenuContent, DropdownMenuItem, DropdownMenuLabel, DropdownMenuSeparator, DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { useToast } from '@/hooks/use-toast';
import { dashboardLanguage } from '@/i18n/i18n-provider';
import { textOf, type BuyerQuestion } from '../../use-buyer-follow-up';
import { useUpdateBuyerSettings } from '../../use-buyers';
import { useLeadReportText } from '../_i18n';
import { useLeadReportColumnsText } from '../_i18n/columns';

// Managers pick which Buyer questions are report columns
// (buyerMatch.reportQuestions); the picked order is the questions' order.
export function ColumnPicker({ questions, picked }: { questions: BuyerQuestion[]; picked: string[] }) {
  const t = useLeadReportText();
  const c = useLeadReportColumnsText();
  const { toast } = useToast();
  const save = useUpdateBuyerSettings();
  const active = questions.filter((q) => q.isActive);
  const toggle = (qkey: string, on: boolean) => {
    const next = new Set(picked);
    if (on) next.add(qkey);
    else next.delete(qkey);
    const reportQuestions = active.map((q) => q.qkey).filter((k) => next.has(k));
    save.mutate({ reportQuestions }, { onError: (err) => toast({ title: t.saveFailed, description: err.message, variant: 'destructive' }) });
  };

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant="outline" data-testid="lead-report-columns">
          <Columns3 className="mr-2 h-4 w-4" />
          {c.columns}
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-72">
        <DropdownMenuLabel>{c.columnsTitle}</DropdownMenuLabel>
        <p className="px-2 pb-2 text-xs text-muted-foreground">{c.columnsHint}</p>
        <DropdownMenuSeparator />
        {active.length ? (
          active.map((q) => (
            <DropdownMenuCheckboxItem
              key={q.qkey}
              checked={picked.includes(q.qkey)}
              disabled={save.isPending}
              onSelect={(e) => e.preventDefault()}
              onCheckedChange={(on) => toggle(q.qkey, !!on)}
            >
              {textOf(q.label, dashboardLanguage())}
            </DropdownMenuCheckboxItem>
          ))
        ) : (
          <p className="px-2 py-1.5 text-sm text-muted-foreground">{c.noQuestions}</p>
        )}
        <DropdownMenuSeparator />
        <DropdownMenuItem asChild>
          <Link href="/dashboard/buyers/settings?tab=questions">{c.editQuestions}</Link>
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
