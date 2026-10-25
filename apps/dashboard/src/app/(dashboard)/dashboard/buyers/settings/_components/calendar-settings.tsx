'use client';

import { useState } from 'react';
import { CheckCircle2, Copy, ExternalLink, Loader2, RefreshCw, XCircle } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { useToast } from '@/hooks/use-toast';
import { dashboardLocale } from '@/i18n/i18n-provider';
import { useCalendarText } from '../../_i18n/calendar';
import {
  useCalendarFeed, useCalendly, useConnectCalendly, useDisconnectCalendly, useRefreshCalendly, useRotateCalendarFeed,
} from '../../use-calendar';

// Settings → Calendar: everyone's own calendar link (.ics feed); managers
// also connect Calendly.
export function CalendarSettings({ canEdit }: { canEdit: boolean }) {
  return (
    <div className="max-w-3xl space-y-6">
      <FeedCard />
      {canEdit ? <CalendlyCard /> : null}
    </div>
  );
}

function FeedCard() {
  const c = useCalendarText();
  const { toast } = useToast();
  const feed = useCalendarFeed();
  const rotate = useRotateCalendarFeed();
  const copy = async (url: string) => {
    try {
      await navigator.clipboard.writeText(url);
      toast({ title: c.copied });
    } catch {
      window.prompt(c.copy, url);
    }
  };

  return (
    <Card data-testid="calendar-feed">
      <CardHeader>
        <CardTitle className="text-base">{c.feedTitle}</CardTitle>
        <CardDescription>{c.feedHint}</CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        {feed.data ? (
          <div className="flex flex-wrap gap-2">
            <Input readOnly value={feed.data.url} className="min-w-[260px] flex-1 font-mono text-xs" onFocus={(e) => e.target.select()} data-testid="calendar-feed-url" />
            <Button variant="outline" onClick={() => copy(feed.data!.url)}><Copy className="mr-2 h-4 w-4" />{c.copy}</Button>
            <Button
              variant="ghost"
              disabled={rotate.isPending}
              onClick={() => window.confirm(c.newLinkConfirm) && rotate.mutate(undefined, { onError: (e) => toast({ title: c.failed, description: e.message, variant: 'destructive' }) })}
            >
              <RefreshCw className="mr-2 h-4 w-4" />{c.newLink}
            </Button>
          </div>
        ) : <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />}
        <ul className="list-disc space-y-1 pl-5 text-sm text-muted-foreground">
          {c.feedHow.map((s) => <li key={s}>{s}</li>)}
        </ul>
      </CardContent>
    </Card>
  );
}

function CalendlyCard() {
  const c = useCalendarText();
  const { toast } = useToast();
  const data = useCalendly(true);
  const connect = useConnectCalendly();
  const refresh = useRefreshCalendly();
  const disconnect = useDisconnectCalendly();
  const [token, setToken] = useState('');
  const fail = (e: Error) => toast({ title: c.failed, description: e.message, variant: 'destructive' });
  const d = data.data;
  const when = (s: string | null) => (s ? new Date(s).toLocaleString(dashboardLocale()) : '—');

  return (
    <>
      <Card data-testid="calendly-settings">
        <CardHeader>
          <CardTitle className="text-base">{c.calendlyTitle}</CardTitle>
          <CardDescription>{c.calendlyDescription}</CardDescription>
        </CardHeader>
        <CardContent className="space-y-5">
          {!d ? (
            <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
          ) : !d.connected ? (
            <div className="space-y-1.5">
              <Label htmlFor="calendly-token">{c.token}</Label>
              <div className="flex flex-wrap gap-2">
                <Input id="calendly-token" type="password" autoComplete="off" value={token} maxLength={2000} onChange={(e) => setToken(e.target.value)} className="min-w-[260px] flex-1" />
                <Button
                  disabled={token.trim().length < 10 || connect.isPending}
                  onClick={() => connect.mutate(token.trim(), { onSuccess: () => { setToken(''); toast({ title: c.saved }); }, onError: fail })}
                  data-testid="calendly-connect"
                >
                  {connect.isPending ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
                  {c.connect}
                </Button>
              </div>
              <p className="text-xs text-muted-foreground">{c.tokenHint}</p>
            </div>
          ) : (
            <>
              <div className="space-y-1 text-sm" data-testid="calendly-status">
                <p className="font-medium">{c.connectedAs(d.ownerEmail ?? '')}</p>
                <p className="flex items-center gap-1.5">
                  {d.automatic ? <CheckCircle2 className="h-4 w-4 text-emerald-600" /> : <XCircle className="h-4 w-4 text-amber-600" />}
                  {d.automatic ? c.automatic : c.linksOnly}
                </p>
                {d.automatic && d.scope === 'user' ? <p className="text-xs text-muted-foreground">{c.scopeUser}</p> : null}
              </div>
              <div className="overflow-x-auto rounded-md border">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>{c.members}</TableHead>
                      <TableHead>{c.bookingPage}</TableHead>
                      <TableHead>{c.agent}</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {d.members.map((m) => (
                      <TableRow key={m.email} data-testid="calendly-member">
                        <TableCell className="text-sm">{m.name || m.email}<div className="text-xs text-muted-foreground">{m.email}</div></TableCell>
                        <TableCell className="text-xs">
                          {m.schedulingUrl ? (
                            <a href={m.schedulingUrl} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1 text-primary hover:underline">
                              {m.schedulingUrl.replace(/^https:\/\//, '')}<ExternalLink className="h-3 w-3" />
                            </a>
                          ) : '—'}
                        </TableCell>
                        <TableCell className="text-sm">{m.agentName ?? <span className="text-xs text-amber-700">{c.notMatched}</span>}</TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
              <div className="grid gap-1 text-sm sm:grid-cols-[180px_1fr]">
                <span className="text-muted-foreground">{c.lastBooking}</span>
                <span>{when(d.lastEventAt)}</span>
                <span className="text-muted-foreground">{c.bookings}</span>
                <span className="tabular-nums">{d.bookings}</span>
                {d.lastError ? (
                  <>
                    <span className="text-muted-foreground">{c.lastError}</span>
                    <span className="flex items-start gap-1.5 text-destructive" data-testid="calendly-error">
                      <XCircle className="mt-0.5 h-4 w-4 shrink-0" />{d.lastError}
                    </span>
                  </>
                ) : null}
              </div>
              <div className="flex flex-wrap gap-2">
                <Button variant="outline" disabled={refresh.isPending} onClick={() => refresh.mutate(undefined, { onError: fail })}>
                  {refresh.isPending ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <RefreshCw className="mr-2 h-4 w-4" />}
                  {c.refresh}
                </Button>
                <Button variant="ghost" className="text-destructive" disabled={disconnect.isPending} onClick={() => window.confirm(c.disconnectConfirm) && disconnect.mutate(undefined, { onError: fail })}>
                  {c.disconnect}
                </Button>
              </div>
            </>
          )}
        </CardContent>
      </Card>
      <Card>
        <CardContent className="pt-6">
          <ul className="list-disc space-y-1 pl-5 text-sm text-muted-foreground">
            {c.calendlyHow.map((s) => <li key={s}>{s}</li>)}
          </ul>
        </CardContent>
      </Card>
    </>
  );
}
