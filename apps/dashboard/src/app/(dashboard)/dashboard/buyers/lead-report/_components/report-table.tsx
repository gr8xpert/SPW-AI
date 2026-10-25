'use client';

import { useState } from 'react';
import Link from 'next/link';
import { FileText, Phone } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { useToast } from '@/hooks/use-toast';
import { dashboardLanguage, dashboardLocale } from '@/i18n/i18n-provider';
import { cn } from '@/lib/utils';
import { useBuyerText } from '../../_i18n/use-buyer-text';
import { stageName, type BuyerAgent, type BuyerStage } from '../../use-buyers';
import { textOf, type BuyerQuestion } from '../../use-buyer-follow-up';
import { buyerWhatsAppBase, newLeadWhatsAppBase } from '../../use-whatsapp';
import { WhatsAppButton, hasPhoneNumber } from '../../_components/whatsapp-button';
import { useLeadReportText } from '../_i18n';
import { useLeadReportColumnsText } from '../_i18n/columns';
import { duration, useSetAgent, useSetStage, type FollowUpStatus, type LeadReportRow } from '../use-lead-report';
import { LogDialog } from './log-dialog';
import { CopyBookingLink } from './copy-booking-link';
import { AnswerCell, AppointmentCell, DateCell, PropertyTypeCell } from './sheet-cells';

const STATUS_STYLE: Record<FollowUpStatus, string> = {
  overdue: 'border-red-300 bg-red-50 text-red-700 dark:border-red-900 dark:bg-red-950/40 dark:text-red-300',
  not_contacted: 'border-slate-300 bg-slate-50 text-slate-700 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-300',
  tried: 'border-amber-300 bg-amber-50 text-amber-800 dark:border-amber-900 dark:bg-amber-950/40 dark:text-amber-300',
  call_back: 'border-sky-300 bg-sky-50 text-sky-800 dark:border-sky-900 dark:bg-sky-950/40 dark:text-sky-300',
  wrong_number: 'border-rose-300 bg-rose-50 text-rose-700 dark:border-rose-900 dark:bg-rose-950/40 dark:text-rose-300',
  reached: 'border-emerald-300 bg-emerald-50 text-emerald-800 dark:border-emerald-900 dark:bg-emerald-950/40 dark:text-emerald-300',
};

const NOBODY = '__nobody__';

const money = (n: number) => (n >= 1_000_000 ? `€${Math.round(n / 100_000) / 10}M` : n >= 1000 ? `€${Math.round(n / 1000)}k` : `€${n}`);
function budget(r: LeadReportRow): string {
  if (r.budgetMin && r.budgetMax) return `${money(r.budgetMin)} – ${money(r.budgetMax)}`;
  if (r.budgetMax) return `≤ ${money(r.budgetMax)}`;
  if (r.budgetMin) return `${money(r.budgetMin)} +`;
  return '';
}
const day = (iso: string) => new Date(iso).toLocaleDateString(dashboardLocale(), { day: 'numeric', month: 'short' });

// Text that can be long (notes, form answers): a few lines, the rest on click.
function Clamp({ text, lines = 2 }: { text: string; lines?: 2 | 3 }) {
  const t = useLeadReportText();
  const [open, setOpen] = useState(false);
  const long = text.length > (lines === 2 ? 90 : 140) || text.split('\n').length > lines;
  return (
    <div className="min-w-[200px] max-w-[260px] text-xs">
      <p className={cn('whitespace-pre-line', !open && (lines === 2 ? 'line-clamp-2' : 'line-clamp-3'))} title={open ? undefined : text}>{text}</p>
      {long ? (
        <button type="button" className="text-[11px] text-primary hover:underline" onClick={() => setOpen((o) => !o)}>{open ? t.less : t.more}</button>
      ) : null}
    </div>
  );
}

type RowProps = { r: LeadReportRow; stages: BuyerStage[]; agents: BuyerAgent[]; questions: BuyerQuestion[]; manager: boolean; booking: boolean };

function Row({ r, stages, agents, questions, manager, booking }: RowProps) {
  const t = useLeadReportText();
  const bt = useBuyerText();
  const { toast } = useToast();
  const setStage = useSetStage();
  const setAgent = useSetAgent();
  const [log, setLog] = useState<'call' | 'note' | null>(null);
  const f = r.followUp;
  const phone = r.mobile || r.phone;
  const name = r.name === '—' ? t.noName : r.name;
  const failed = (err: Error) => toast({ title: t.saveFailed, description: err.message, variant: 'destructive' });
  const waitingHours = (Date.now() - new Date(r.createdAt).getTime()) / 3_600_000;
  const counts = [f.calls ? t.calls(f.calls) : '', f.whatsapps ? t.whatsapps(f.whatsapps) : '', f.emails ? t.emails(f.emails) : ''].filter(Boolean).join(' · ');

  return (
    <TableRow data-testid={`lead-row-${r.id}`} className={cn(f.status === 'overdue' && 'bg-red-50/40 dark:bg-red-950/10')}>
      <TableCell className="min-w-[180px] align-top">
        <Link href={`/dashboard/buyers/${r.id}`} className="font-medium hover:text-primary hover:underline">{name}</Link>
        <div className="mt-0.5 flex flex-wrap items-center gap-1 text-[11px] text-muted-foreground">
          <span>{bt.sources[r.source as keyof typeof bt.sources] ?? r.source}</span>
          {r.isNewLead ? <Badge variant="secondary" className="h-4 px-1.5 text-[10px]">{t.newLead}</Badge> : null}
        </div>
      </TableCell>
      <DateCell iso={r.createdAt} />
      <TableCell className="align-top text-xs">
        {phone ? <a href={`tel:${phone.replace(/[^\d+]/g, '')}`} className="block whitespace-nowrap hover:text-primary hover:underline">{phone}</a> : null}
        {r.email ? <a href={`mailto:${r.email}`} className="block max-w-[200px] truncate text-muted-foreground hover:text-primary hover:underline" title={r.email}>{r.email}</a> : null}
      </TableCell>
      <TableCell className="align-top">
        {manager ? (
          <Select
            value={r.agent ? String(r.agent.id) : NOBODY}
            onValueChange={(v) => setAgent.mutate({ id: r.id, assignedTo: v === NOBODY ? null : Number(v) }, { onError: failed })}
          >
            <SelectTrigger className="h-8 w-[140px] text-xs" data-testid="row-agent"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value={NOBODY}>{t.nobody}</SelectItem>
              {agents.map((a) => <SelectItem key={a.id} value={String(a.id)}>{a.name || a.email}</SelectItem>)}
              {/* An agent who no longer works with buyers still shows as the current one. */}
              {r.agent && !agents.some((a) => a.id === r.agent!.id) ? <SelectItem value={String(r.agent.id)}>{r.agent.name}</SelectItem> : null}
            </SelectContent>
          </Select>
        ) : <span className="text-xs">{r.agent?.name ?? t.nobody}</span>}
      </TableCell>
      <TableCell className="align-top">
        <Select value={r.stage ? String(r.stage.id) : undefined} onValueChange={(v) => setStage.mutate({ id: r.id, stageId: Number(v) }, { onError: failed })}>
          <SelectTrigger className="h-8 w-[140px] text-xs" data-testid="row-stage">
            <span className="flex items-center gap-1.5 truncate">
              <span className="h-2 w-2 shrink-0 rounded-full" style={{ background: r.stage?.color || '#94a3b8' }} />
              <SelectValue placeholder="—" />
            </span>
          </SelectTrigger>
          <SelectContent>
            {stages.map((s) => <SelectItem key={s.id} value={String(s.id)}>{stageName(s)}</SelectItem>)}
          </SelectContent>
        </Select>
      </TableCell>
      <TableCell className="min-w-[150px] align-top">
        <span className={cn('inline-flex rounded-full border px-2 py-0.5 text-[11px] font-medium', STATUS_STYLE[f.status])} data-testid="row-status" data-status={f.status}>
          {t.status[f.status]}
        </span>
        <div className="mt-1 space-y-0.5 text-[11px] text-muted-foreground">
          {counts ? <p>{counts}</p> : null}
          {f.lastOutcome && f.status !== 'call_back' && f.status !== 'wrong_number' ? <p>{t.outcomes[f.lastOutcome]}</p> : null}
          {f.status === 'overdue' || f.status === 'not_contacted' ? (
            <p className={cn(f.status === 'overdue' && 'font-medium text-red-600')}>{t.waiting(duration(waitingHours))}</p>
          ) : f.firstContactHours !== null ? <p>{t.firstAfter(duration(f.firstContactHours))}</p> : null}
        </div>
      </TableCell>
      <DateCell iso={f.firstContactAt} />
      <AppointmentCell r={r} />
      <TableCell className="align-top">
        {f.lastNote ? (
          <>
            <Clamp text={f.lastNote.text} />
            <p className="mt-0.5 text-[10px] text-muted-foreground">{day(f.lastNote.at)}</p>
          </>
        ) : <span className="text-xs text-muted-foreground">—</span>}
      </TableCell>
      <TableCell className="align-top">{f.enquiry ? <Clamp text={f.enquiry} lines={3} /> : <span className="text-xs text-muted-foreground">—</span>}</TableCell>
      <TableCell className="whitespace-nowrap align-top text-xs">{budget(r) || <span className="text-muted-foreground">—</span>}</TableCell>
      <PropertyTypeCell r={r} />
      {questions.map((q) => <AnswerCell key={q.qkey} r={r} q={q} />)}
      <TableCell className="align-top">
        <div className="flex items-center gap-1">
          <Button size="sm" variant="outline" className="h-8 px-2" onClick={() => setLog('call')} title={t.logCall} data-testid="row-log-call">
            <Phone className="mr-1 h-3.5 w-3.5" />{t.logCall}
          </Button>
          <Button size="sm" variant="ghost" className="h-8 w-8 p-0" onClick={() => setLog('note')} title={t.note} aria-label={t.note} data-testid="row-note">
            <FileText className="h-4 w-4" />
          </Button>
          {booking ? <CopyBookingLink leadId={r.id} /> : null}
          {hasPhoneNumber(r) ? (
            <WhatsAppButton
              base={r.isNewLead ? newLeadWhatsAppBase(r.id) : buyerWhatsAppBase(r.id)}
              kind={r.isNewLead ? 'enquiry' : 'follow_up'}
              hasPhone
              iconOnly
              variant="ghost"
              className="h-8 w-8 p-0"
              testId="row-whatsapp"
            />
          ) : null}
        </div>
        <LogDialog leadId={r.id} name={name} mode={log} onOpenChange={(o) => !o && setLog(null)} />
      </TableCell>
    </TableRow>
  );
}

export function ReportTable({ rows, ...rest }: Omit<RowProps, 'r'> & { rows: LeadReportRow[] }) {
  const t = useLeadReportText();
  const x = useLeadReportColumnsText();
  const c = t.columns;
  const lang = dashboardLanguage();
  return (
    <div className="overflow-x-auto rounded-md border">
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>{c.lead}</TableHead>
            <TableHead>{x.cameIn}</TableHead>
            <TableHead>{c.contact}</TableHead>
            <TableHead>{c.agent}</TableHead>
            <TableHead>{c.stage}</TableHead>
            <TableHead>{c.followUp}</TableHead>
            <TableHead>{x.firstContact}</TableHead>
            <TableHead>{x.appointment}</TableHead>
            <TableHead>{c.notes}</TableHead>
            <TableHead>{c.enquiry}</TableHead>
            <TableHead>{c.budget}</TableHead>
            <TableHead>{x.propertyType}</TableHead>
            {rest.questions.map((q) => <TableHead key={q.qkey} className="min-w-[150px]">{textOf(q.label, lang)}</TableHead>)}
            <TableHead>{c.actions}</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {rows.map((r) => <Row key={r.id} r={r} {...rest} />)}
        </TableBody>
      </Table>
    </div>
  );
}
