'use client';

import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { cn } from '@/lib/utils';
import { useLeadReportText } from '../_i18n';
import { duration, type AgentLine } from '../use-lead-report';

// One line per agent (managers see everyone plus a total; an agent sees
// their own line). A click on a name or the overdue count filters the table.
export function AgentSummary({
  agents,
  totals,
  overdueHours,
  manager,
  onPick,
}: {
  agents: AgentLine[];
  totals: AgentLine | null;
  overdueHours: number;
  manager: boolean;
  onPick: (agentId: number | null, status?: string) => void;
}) {
  const t = useLeadReportText();
  const s = t.summary;
  const lines = manager && totals && agents.length > 1 ? [...agents, { ...totals, agentId: -1 as number | null }] : agents;
  const pct = (a: AgentLine) => (a.leads ? `${Math.round((a.contacted / a.leads) * 100)}%` : '—');

  return (
    <Card data-testid="lead-report-summary">
      <CardHeader className="pb-2">
        <CardTitle className="text-base">{s.title}</CardTitle>
        <CardDescription>{s.hint(overdueHours)}</CardDescription>
      </CardHeader>
      <CardContent className="overflow-x-auto p-0 pb-2">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead className="pl-6">{s.agent}</TableHead>
              <TableHead className="text-right">{s.leads}</TableHead>
              <TableHead className="text-right">{s.notContacted}</TableHead>
              <TableHead className="text-right">{s.overdue}</TableHead>
              <TableHead className="text-right">{s.contacted}</TableHead>
              <TableHead className="text-right">{s.reached}</TableHead>
              <TableHead className="text-right" title={s.median}>{s.firstContact}</TableHead>
              <TableHead className="text-right">{s.calls}</TableHead>
              <TableHead className="text-right">{s.whatsapps}</TableHead>
              <TableHead className="text-right">{s.emails}</TableHead>
              <TableHead className="text-right">{s.viewings}</TableHead>
              <TableHead className="pr-6 text-right">{s.won}</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {lines.map((a) => {
              const total = a.agentId === -1;
              const id = total ? null : a.agentId;
              const label = total ? s.total : a.name || (a.agentId === null ? s.nobody : '—');
              // The "Nobody" line filters on agentId 0 (unassigned).
              const pick = (status?: string) => (total ? onPick(null, status) : onPick(id === null ? 0 : id, status));
              return (
                <TableRow key={total ? 'total' : String(a.agentId)} className={cn(total && 'border-t-2 font-medium')} data-testid={total ? 'summary-total' : `summary-agent-${a.agentId ?? 'none'}`}>
                  <TableCell className="pl-6">
                    {manager ? (
                      <button type="button" className="text-left hover:text-primary hover:underline" onClick={() => pick()}>{label}</button>
                    ) : label}
                  </TableCell>
                  <TableCell className="text-right tabular-nums">{a.leads}</TableCell>
                  <TableCell className="text-right tabular-nums">{a.notContacted}</TableCell>
                  <TableCell className="text-right tabular-nums">
                    {a.overdue ? (
                      <button type="button" className="font-semibold text-red-600 hover:underline" onClick={() => pick('overdue')} data-testid="summary-overdue">{a.overdue}</button>
                    ) : <span className="text-muted-foreground">0</span>}
                  </TableCell>
                  <TableCell className="text-right tabular-nums">{a.contacted} <span className="text-xs text-muted-foreground">({pct(a)})</span></TableCell>
                  <TableCell className="text-right tabular-nums">{a.reached}</TableCell>
                  <TableCell className="text-right tabular-nums">{a.medianFirstContactHours === null ? '—' : duration(a.medianFirstContactHours)}</TableCell>
                  <TableCell className="text-right tabular-nums">{a.calls}</TableCell>
                  <TableCell className="text-right tabular-nums">{a.whatsapps}</TableCell>
                  <TableCell className="text-right tabular-nums">{a.emails}</TableCell>
                  <TableCell className="text-right tabular-nums">{a.viewings}</TableCell>
                  <TableCell className="pr-6 text-right tabular-nums">{a.won}</TableCell>
                </TableRow>
              );
            })}
          </TableBody>
        </Table>
      </CardContent>
    </Card>
  );
}
