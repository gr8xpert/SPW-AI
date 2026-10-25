'use client';

import { ChevronDown } from 'lucide-react';
import { Button } from '@/components/ui/button';
import {
  DropdownMenu, DropdownMenuCheckboxItem, DropdownMenuContent, DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { TableCell } from '@/components/ui/table';
import { useToast } from '@/hooks/use-toast';
import { dashboardLanguage, dashboardLocale } from '@/i18n/i18n-provider';
import { cn } from '@/lib/utils';
import { textOf, type BuyerQuestion } from '../../use-buyer-follow-up';
import { useLeadReportText } from '../_i18n';
import { useLeadReportColumnsText } from '../_i18n/columns';
import { useSetRowAnswer, type LeadReportRow } from '../use-lead-report';

// The columns the client's lead sheet had: when the lead came in, the first
// contact, the appointment, property type and the Buyer questions (agents
// answer them right in the row).

const NONE = '__none__';
const dayTime = (iso: string) => new Date(iso).toLocaleString(dashboardLocale(), { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' });
const name = (n: Record<string, string> | null | undefined) => textOf(n, dashboardLanguage());
const muted = <span className="text-xs text-muted-foreground">—</span>;

export function DateCell({ iso }: { iso: string | null }) {
  return <TableCell className="whitespace-nowrap align-top text-xs">{iso ? dayTime(iso) : muted}</TableCell>;
}

export function AppointmentCell({ r }: { r: LeadReportRow }) {
  const c = useLeadReportColumnsText();
  const a = r.appointment;
  if (!a) return <TableCell className="align-top">{muted}</TableCell>;
  return (
    <TableCell className="whitespace-nowrap align-top text-xs" data-testid="row-appointment">
      <span className={cn(a.upcoming ? 'font-medium text-primary' : 'text-muted-foreground')}>{dayTime(a.at)}</span>
      {a.upcoming ? null : <p className="text-[11px] text-muted-foreground">{c.visit[a.status] ?? a.status}</p>}
    </TableCell>
  );
}

export function PropertyTypeCell({ r }: { r: LeadReportRow }) {
  const text = r.propertyTypes.map(name).filter(Boolean).join(', ');
  return <TableCell className="max-w-[160px] align-top text-xs">{text || muted}</TableCell>;
}

export function AnswerCell({ r, q }: { r: LeadReportRow; q: BuyerQuestion }) {
  const t = useLeadReportText();
  const { toast } = useToast();
  const save = useSetRowAnswer();
  const value = r.answers[q.qkey] ?? [];
  const set = (values: string[]) =>
    save.mutate({ row: r, qkey: q.qkey, values }, { onError: (err) => toast({ title: t.saveFailed, description: err.message, variant: 'destructive' }) });
  const label = (key: string) => name(q.options.find((o) => o.key === key)?.label) || key;

  if (q.multiple) {
    return (
      <TableCell className="align-top" data-testid={`row-answer-${q.qkey}`}>
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button variant="outline" size="sm" className="h-8 w-[150px] justify-between px-2 text-xs font-normal">
              <span className="truncate">{value.length ? value.map(label).join(', ') : '—'}</span>
              <ChevronDown className="ml-1 h-3.5 w-3.5 shrink-0 opacity-50" />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="start">
            {q.options.map((o) => (
              <DropdownMenuCheckboxItem
                key={o.key}
                checked={value.includes(o.key)}
                onSelect={(e) => e.preventDefault()}
                onCheckedChange={(on) => set(on ? [...value, o.key] : value.filter((v) => v !== o.key))}
              >
                {name(o.label)}
              </DropdownMenuCheckboxItem>
            ))}
          </DropdownMenuContent>
        </DropdownMenu>
      </TableCell>
    );
  }
  return (
    <TableCell className="align-top" data-testid={`row-answer-${q.qkey}`}>
      <Select value={value[0] ?? NONE} onValueChange={(v) => set(v === NONE ? [] : [v])}>
        <SelectTrigger className="h-8 w-[150px] text-xs"><SelectValue /></SelectTrigger>
        <SelectContent>
          <SelectItem value={NONE}>—</SelectItem>
          {q.options.map((o) => <SelectItem key={o.key} value={o.key}>{name(o.label)}</SelectItem>)}
          {/* An answer to an option that was removed since. */}
          {value[0] && !q.options.some((o) => o.key === value[0]) ? <SelectItem value={value[0]}>{value[0]}</SelectItem> : null}
        </SelectContent>
      </Select>
    </TableCell>
  );
}
