'use client';

import { useEffect, useState } from 'react';
import { AlertTriangle, Loader2, RefreshCw } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Checkbox } from '@/components/ui/checkbox';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import { useApi } from '@/hooks/use-api';
import { useToast } from '@/hooks/use-toast';
import { useLanguage } from '@/i18n/i18n-provider';
import { useMailerLiteText, type MailerLiteText } from './_i18n';

const ENDPOINT = '/api/dashboard/mailerlite';
const POLL_MS = 5000;

interface Status {
  connected: boolean;
  keyLast4: string | null;
  consent: { at: string; by: string | null } | null;
  syncing: boolean;
  needsAttention: boolean;
  lastSyncAt: string | null;
  counts: { added: number; updated: number; unchanged: number; skipped: number; failed: number };
  notice: keyof MailerLiteText['notices'] | null;
}

function unwrap(res: any): Status | null {
  const body = res?.data ?? res;
  return body && typeof body.connected === 'boolean' ? (body as Status) : null;
}

function connectError(t: MailerLiteText, err: unknown): string {
  const code = (err as { code?: string })?.code;
  if (code === 'BAD_KEY') return t.errors.BAD_KEY;
  if (code === 'MAILERLITE_BUSY') return t.errors.MAILERLITE_BUSY;
  return t.errors.generic;
}

function ConnectForm({ t, busy, error, onConnect }: { t: MailerLiteText; busy: boolean; error: string | null; onConnect: (key: string) => void }) {
  const [key, setKey] = useState('');
  return (
    <form
      className="space-y-4"
      onSubmit={(e) => {
        e.preventDefault();
        if (key.trim()) onConnect(key.trim());
      }}
    >
      <div className="space-y-2">
        <Label htmlFor="mailerlite-key">{t.connect.keyLabel}</Label>
        <Input
          id="mailerlite-key"
          type="password"
          autoComplete="off"
          value={key}
          onChange={(e) => setKey(e.target.value)}
          placeholder={t.connect.keyPlaceholder}
          aria-invalid={!!error}
        />
        {error && (
          <p role="alert" className="text-sm text-destructive">
            {error}
          </p>
        )}
      </div>
      <div className="rounded-md bg-muted p-3 text-sm">
        <p className="font-medium">{t.connect.whereTitle}</p>
        <p className="mt-1 text-muted-foreground">{t.connect.whereSteps}</p>
      </div>
      <Button type="submit" disabled={busy || !key.trim()}>
        {busy && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
        {busy ? t.connect.connecting : t.connect.button}
      </Button>
    </form>
  );
}

function CountBox({ label, value }: { label: string; value: number }) {
  return (
    <div className="rounded-md border p-3">
      <p className="text-xs text-muted-foreground">{label}</p>
      <p className="mt-1 text-xl font-semibold tabular-nums">{value.toLocaleString()}</p>
    </div>
  );
}

// The client's own MailerLite account: connect with a key, confirm consent,
// see how syncing goes. Sending happens in MailerLite, not here.
export function MailerLiteCard() {
  const api = useApi();
  const { toast } = useToast();
  const { locale } = useLanguage();
  const t = useMailerLiteText();

  const [status, setStatus] = useState<Status | null>(null);
  const [loadFailed, setLoadFailed] = useState(false);
  const [busy, setBusy] = useState(false);
  const [connectFailure, setConnectFailure] = useState<string | null>(null);
  const [agreed, setAgreed] = useState(false);
  const [confirmDisconnect, setConfirmDisconnect] = useState(false);

  const load = async () => {
    if (!api.isReady) return;
    try {
      setStatus(unwrap(await api.get(ENDPOINT)));
      setLoadFailed(false);
    } catch {
      setLoadFailed(true);
    }
  };

  useEffect(() => {
    load();
  }, [api.isReady]); // eslint-disable-line react-hooks/exhaustive-deps

  // A sync is on its way: follow its numbers.
  const syncing = !!status?.syncing;
  useEffect(() => {
    if (!syncing) return;
    const timer = setInterval(load, POLL_MS);
    return () => clearInterval(timer);
  }, [syncing, api.isReady]); // eslint-disable-line react-hooks/exhaustive-deps

  const act = async (call: () => Promise<any>) => {
    setBusy(true);
    try {
      setStatus(unwrap(await call()));
    } catch {
      toast({ title: t.errors.actionFailed, variant: 'destructive' });
    } finally {
      setBusy(false);
    }
  };

  const connect = async (apiKey: string) => {
    setBusy(true);
    setConnectFailure(null);
    try {
      setStatus(unwrap(await api.post(`${ENDPOINT}/connect`, { apiKey })));
      setAgreed(false);
    } catch (err) {
      setConnectFailure(connectError(t, err));
    } finally {
      setBusy(false);
    }
  };

  const when = (value: string) => new Date(value).toLocaleString(locale, { dateStyle: 'medium', timeStyle: 'short' });

  const connected = status?.connected;
  const attention = status?.needsAttention;

  return (
    <Card>
      <CardHeader>
        <div className="flex flex-wrap items-center gap-2">
          <CardTitle>{t.title}</CardTitle>
          {connected && !attention && <Badge variant="success">{t.connected.badge}</Badge>}
          {attention && <Badge variant="destructive">{t.attention.badge}</Badge>}
        </div>
        <CardDescription>{t.description}</CardDescription>
      </CardHeader>
      <CardContent className="space-y-5">
        {loadFailed && (
          <p role="alert" className="text-sm text-destructive">
            {t.errors.loadFailed}
          </p>
        )}

        {!status && !loadFailed && <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" aria-hidden />}

        {status && !connected && (
          <>
            <p className="text-sm text-muted-foreground">{t.intro}</p>
            <ConnectForm t={t} busy={busy} error={connectFailure} onConnect={connect} />
          </>
        )}

        {connected && status.notice && (
          <div role="alert" className="flex gap-2 rounded-md border border-destructive/40 bg-destructive/5 p-3 text-sm">
            <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-destructive" aria-hidden />
            <p>{t.notices[status.notice]}</p>
          </div>
        )}

        {attention && (
          <div className="space-y-2">
            <p className="text-sm font-medium">{t.attention.newKey}</p>
            <ConnectForm t={t} busy={busy} error={connectFailure} onConnect={connect} />
          </div>
        )}

        {connected && !attention && !status.consent && (
          <div className="space-y-3 rounded-md border p-4">
            <p className="font-medium">{t.consent.title}</p>
            <div className="flex items-start gap-2">
              <Checkbox id="mailerlite-consent" checked={agreed} onCheckedChange={(v) => setAgreed(v === true)} className="mt-0.5" />
              <Label htmlFor="mailerlite-consent" className="font-normal leading-snug">
                {t.consent.checkbox}
              </Label>
            </div>
            <p className="text-sm text-muted-foreground">{t.consent.help}</p>
            <Button disabled={!agreed || busy} onClick={() => act(() => api.post(`${ENDPOINT}/consent`, { confirmed: true }))}>
              {busy && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              {t.consent.button}
            </Button>
          </div>
        )}

        {connected && status.consent && !attention && (
          <div className="space-y-4">
            <div className="flex flex-wrap items-baseline gap-x-2 text-sm">
              <span className="font-medium">{t.connected.lastSync}:</span>
              <span className="text-muted-foreground">{status.lastSyncAt ? when(status.lastSyncAt) : t.connected.never}</span>
            </div>

            {status.syncing && (
              <p className="flex items-center gap-2 text-sm text-muted-foreground" role="status">
                <Loader2 className="h-4 w-4 shrink-0 animate-spin" aria-hidden />
                {t.connected.syncing}
              </p>
            )}

            <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-5">
              <CountBox label={t.counts.added} value={status.counts.added} />
              <CountBox label={t.counts.updated} value={status.counts.updated} />
              <CountBox label={t.counts.unchanged} value={status.counts.unchanged} />
              <CountBox label={t.counts.skipped} value={status.counts.skipped} />
              <CountBox label={t.counts.failed} value={status.counts.failed} />
            </div>
            <p className="text-xs text-muted-foreground">{t.counts.skippedHelp}</p>

            <Button disabled={busy || status.syncing} onClick={() => act(() => api.post(`${ENDPOINT}/sync`))}>
              {status.syncing ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <RefreshCw className="mr-2 h-4 w-4" />}
              {t.connected.syncNow}
            </Button>
            <p className="text-sm text-muted-foreground">{t.connected.daily}</p>
            <p className="text-sm text-muted-foreground">{t.connected.groups}</p>
          </div>
        )}

        {connected && (
          <div className="space-y-3 border-t pt-4">
            <p className="text-sm text-muted-foreground">{t.connected.statsNote}</p>
            <div className="flex flex-wrap items-center justify-between gap-3 text-xs text-muted-foreground">
              <div className="space-y-1">
                {status.keyLast4 && <p>{t.connected.keyEnding(status.keyLast4)}</p>}
                {status.consent && <p>{t.connected.consentBy(status.consent.by ?? '-', when(status.consent.at))}</p>}
              </div>
              <Button variant="outline" size="sm" disabled={busy} onClick={() => setConfirmDisconnect(true)}>
                {t.connected.disconnect}
              </Button>
            </div>
          </div>
        )}
      </CardContent>

      <AlertDialog open={confirmDisconnect} onOpenChange={setConfirmDisconnect}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{t.disconnect.title}</AlertDialogTitle>
            <AlertDialogDescription>{t.disconnect.body}</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>{t.disconnect.cancel}</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => {
                setConnectFailure(null);
                act(() => api.delete(ENDPOINT));
              }}
            >
              {t.disconnect.confirm}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </Card>
  );
}
