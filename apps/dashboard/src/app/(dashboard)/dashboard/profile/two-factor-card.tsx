'use client';

import { useState } from 'react';
import { signOut, useSession } from 'next-auth/react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Check, Copy, KeyRound, Loader2, ShieldAlert, ShieldCheck } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { useApi } from '@/hooks/use-api';
import { useToast } from '@/hooks/use-toast';

// Two-factor login for the signed-in user (milestone J) and, for the agency
// admin, the switch that makes it compulsory for everyone.

interface Status {
  enabled: boolean;
  required: boolean;
  recoveryLeft: number;
}

const one = <T,>(r: unknown): T => (r && typeof r === 'object' && 'data' in (r as object) ? (r as { data: T }).data : (r as T));

function RecoveryCodes({ codes }: { codes: string[] }) {
  const [copied, setCopied] = useState(false);
  return (
    <div className="space-y-2 rounded-md border border-amber-300 bg-amber-50 p-4 dark:bg-amber-950/30" data-testid="recovery-codes">
      <p className="text-sm font-medium">Recovery codes — save them now, they are shown only once.</p>
      <p className="text-xs text-muted-foreground">Each code works once, if you lose your phone.</p>
      <div className="grid grid-cols-2 gap-1 font-mono text-sm sm:grid-cols-4">
        {codes.map((c) => <span key={c}>{c}</span>)}
      </div>
      <Button
        size="sm"
        variant="outline"
        onClick={async () => {
          await navigator.clipboard.writeText(codes.join('\n')).catch(() => undefined);
          setCopied(true);
        }}
      >
        {copied ? <Check className="mr-1 h-4 w-4" /> : <Copy className="mr-1 h-4 w-4" />}
        {copied ? 'Copied' : 'Copy codes'}
      </Button>
    </div>
  );
}

export function TwoFactorCard() {
  const api = useApi();
  const { data: session } = useSession();
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const mustSetUp = !!session?.user?.mfaSetup;
  const isAdmin = session?.user?.role === 'admin';
  const status = useQuery({
    queryKey: ['two-factor', session?.user?.id],
    queryFn: async () => one<Status>(await api.get('/api/auth/2fa')),
    enabled: api.isReady,
  });
  const [setup, setSetup] = useState<{ secret: string; qr: string } | null>(null);
  const [code, setCode] = useState('');
  const [password, setPassword] = useState('');
  const [codes, setCodes] = useState<string[] | null>(null);
  const [turningOff, setTurningOff] = useState(false);
  const refresh = () => queryClient.invalidateQueries({ queryKey: ['two-factor'] });
  const fail = (e: Error) => toast({ title: 'Could not save', description: e.message, variant: 'destructive' });

  const start = useMutation({
    mutationFn: async () => one<{ secret: string; qr: string }>(await api.post('/api/auth/2fa/setup')),
    onSuccess: (s) => setSetup(s),
    onError: fail,
  });
  const enable = useMutation({
    mutationFn: async () => one<{ recoveryCodes: string[] }>(await api.post('/api/auth/2fa/enable', { code: code.trim() })),
    onSuccess: (r) => {
      setCodes(r.recoveryCodes);
      setSetup(null);
      setCode('');
      void refresh();
    },
    onError: fail,
  });
  const disable = useMutation({
    mutationFn: async () => one<unknown>(await api.post('/api/auth/2fa/disable', { password, code: code.trim() })),
    onSuccess: () => {
      setTurningOff(false);
      setPassword('');
      setCode('');
      setCodes(null);
      toast({ title: 'Two-factor login is off' });
      void refresh();
    },
    onError: fail,
  });
  const newCodes = useMutation({
    mutationFn: async () => one<{ recoveryCodes: string[] }>(await api.post('/api/auth/2fa/recovery-codes', { code: code.trim() })),
    onSuccess: (r) => {
      setCodes(r.recoveryCodes);
      setCode('');
      void refresh();
    },
    onError: fail,
  });
  const require2fa = useMutation({
    mutationFn: async (on: boolean) => one<{ required: boolean }>(await api.put('/api/auth/2fa/require', { on })),
    onSuccess: (r) => {
      toast({ title: r.required ? 'Everyone in your agency must now use two-factor login' : 'Two-factor login is optional again' });
      void refresh();
    },
    onError: fail,
  });

  const s = status.data;
  return (
    <div className="space-y-6">
      {mustSetUp ? (
        <div className="flex items-start gap-3 rounded-md border border-amber-300 bg-amber-50 p-4 text-sm dark:bg-amber-950/30" data-testid="mfa-required">
          <ShieldAlert className="mt-0.5 h-5 w-5 shrink-0 text-amber-600" />
          <div>
            <p className="font-medium">Your agency requires two-factor login.</p>
            <p className="text-muted-foreground">Set it up below. Then log in again with a code to open the dashboard.</p>
          </div>
        </div>
      ) : null}

      <Card data-testid="two-factor-card">
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-base">
            {s?.enabled ? <ShieldCheck className="h-5 w-5 text-emerald-600" /> : <KeyRound className="h-5 w-5 text-muted-foreground" />}
            Two-factor login
          </CardTitle>
          <CardDescription>
            Besides your password, log in with a 6-digit code from an app on your phone (Google Authenticator, Microsoft Authenticator, 1Password, Authy…).
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          {status.isLoading || !s ? (
            <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
          ) : codes ? (
            <div className="space-y-3">
              <RecoveryCodes codes={codes} />
              {mustSetUp ? (
                <Button onClick={() => signOut({ callbackUrl: '/login' })} data-testid="login-again">
                  I saved them — log in again
                </Button>
              ) : (
                <Button variant="outline" onClick={() => setCodes(null)}>Done</Button>
              )}
            </div>
          ) : s.enabled ? (
            <div className="space-y-4">
              <p className="text-sm" data-testid="two-factor-on">
                <span className="font-medium text-emerald-700 dark:text-emerald-400">On.</span> {s.recoveryLeft} recovery {s.recoveryLeft === 1 ? 'code' : 'codes'} left.
              </p>
              <div className="flex flex-wrap items-end gap-3">
                <div className="space-y-1">
                  <Label htmlFor="tf-code" className="text-xs">Code from your app</Label>
                  <Input id="tf-code" className="w-40" inputMode="numeric" autoComplete="one-time-code" value={code} maxLength={20} onChange={(e) => setCode(e.target.value)} />
                </div>
                {turningOff ? (
                  <div className="space-y-1">
                    <Label htmlFor="tf-password" className="text-xs">Your password</Label>
                    <Input id="tf-password" type="password" className="w-52" value={password} onChange={(e) => setPassword(e.target.value)} />
                  </div>
                ) : null}
                <Button variant="outline" disabled={code.trim().length < 6 || newCodes.isPending} onClick={() => newCodes.mutate()}>
                  New recovery codes
                </Button>
                {s.required ? (
                  <span className="text-xs text-muted-foreground">Your agency requires it, so it can&apos;t be turned off.</span>
                ) : turningOff ? (
                  <Button variant="destructive" disabled={code.trim().length < 6 || !password || disable.isPending} onClick={() => disable.mutate()} data-testid="tf-disable">
                    Turn off
                  </Button>
                ) : (
                  <Button variant="ghost" onClick={() => setTurningOff(true)}>Turn off…</Button>
                )}
              </div>
            </div>
          ) : setup ? (
            <div className="grid gap-6 sm:grid-cols-[220px_1fr]">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={setup.qr} alt="QR code for your authenticator app" width={220} height={220} className="rounded-md border bg-white" data-testid="tf-qr" />
              <div className="space-y-3 text-sm">
                <ol className="list-decimal space-y-1 pl-5">
                  <li>Open your authenticator app and add an account.</li>
                  <li>Scan the QR code, or type this key: <code className="break-all rounded bg-muted px-1 py-0.5 text-xs" data-testid="tf-secret">{setup.secret}</code></li>
                  <li>Type the 6-digit code the app shows.</li>
                </ol>
                <div className="flex flex-wrap items-end gap-2">
                  <div className="space-y-1">
                    <Label htmlFor="tf-first" className="text-xs">Code</Label>
                    <Input id="tf-first" className="w-40" inputMode="numeric" autoComplete="one-time-code" value={code} maxLength={7} onChange={(e) => setCode(e.target.value)} />
                  </div>
                  <Button disabled={code.trim().length < 6 || enable.isPending} onClick={() => enable.mutate()} data-testid="tf-enable">
                    {enable.isPending ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
                    Turn on
                  </Button>
                  <Button variant="ghost" onClick={() => setSetup(null)}>Cancel</Button>
                </div>
              </div>
            </div>
          ) : (
            <Button onClick={() => start.mutate()} disabled={start.isPending} data-testid="tf-start">
              {start.isPending ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
              Set up two-factor login
            </Button>
          )}
        </CardContent>
      </Card>

      {isAdmin && s && !mustSetUp ? (
        <Card data-testid="two-factor-agency">
          <CardHeader>
            <CardTitle className="text-base">Your agency</CardTitle>
            <CardDescription>Everyone who logs in to your dashboard must use two-factor login. Users without it are asked to set it up at their next login.</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="flex items-center gap-3">
              <Switch id="tf-require" checked={s.required} disabled={require2fa.isPending || (!s.enabled && !s.required)} onCheckedChange={(on) => require2fa.mutate(on)} />
              <Label htmlFor="tf-require">Require two-factor login for everyone</Label>
            </div>
            {!s.enabled && !s.required ? <p className="mt-2 text-xs text-muted-foreground">Turn it on for yourself first.</p> : null}
          </CardContent>
        </Card>
      ) : null}
    </div>
  );
}
