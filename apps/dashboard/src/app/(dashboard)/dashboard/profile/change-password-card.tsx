'use client';

import { useEffect, useState } from 'react';
import { signOut, useSession } from 'next-auth/react';
import { useMutation } from '@tanstack/react-query';
import { Loader2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { useApi } from '@/hooks/use-api';
import { useToast } from '@/hooks/use-toast';
import { getImpersonationSession } from '@/lib/impersonation';
import { useProfileText } from './_i18n';

const MIN_LENGTH = 8;
// Long enough to read the message before the login page opens.
const LOGOUT_DELAY_MS = 1500;

// The signed-in user's own password. Changing it logs them out everywhere, this
// browser too, so they log in again with the new one.
export function ChangePasswordCard() {
  const api = useApi();
  const { data: session } = useSession();
  const { toast } = useToast();
  const t = useProfileText();
  const [current, setCurrent] = useState('');
  const [next, setNext] = useState('');
  const [repeat, setRepeat] = useState('');
  // Read after mount: the page is first rendered without browser storage.
  const [viewingAsClient, setViewingAsClient] = useState(false);
  useEffect(() => setViewingAsClient(!!getImpersonationSession()), []);

  const change = useMutation({
    mutationFn: () => api.post('/api/auth/change-password', { currentPassword: current, newPassword: next }),
    onSuccess: () => {
      toast({ title: t.passwordChanged });
      setTimeout(() => void signOut({ callbackUrl: '/login' }), LOGOUT_DELAY_MS);
    },
    onError: (e: Error & { code?: string }) => {
      const description = e.code === 'WRONG_PASSWORD' ? t.wrongPassword : e.code === 'SAME_PASSWORD' ? t.samePassword : e.message;
      toast({ title: t.saveFailed, description, variant: 'destructive' });
    },
  });

  // A Super Admin viewing as a client must not change the client's password
  // here, and a user who must set up two-factor login can't use this route yet.
  if (viewingAsClient || session?.user?.mfaSetup) return null;

  const tooShort = next.length > 0 && next.length < MIN_LENGTH;
  const mismatch = repeat.length > 0 && repeat !== next;
  const ready = current.length > 0 && next.length >= MIN_LENGTH && repeat === next;
  const busy = change.isPending || change.isSuccess;

  return (
    <Card>
      <CardHeader className="pb-2">
        <CardTitle className="text-base">{t.changePassword}</CardTitle>
        <CardDescription>{t.changePasswordHelp}</CardDescription>
      </CardHeader>
      <CardContent>
        <form
          className="max-w-sm space-y-3"
          onSubmit={(e) => {
            e.preventDefault();
            if (ready && !busy) change.mutate();
          }}
        >
          <div className="space-y-1.5">
            <Label htmlFor="current-password">{t.currentPassword}</Label>
            <Input id="current-password" type="password" autoComplete="current-password" value={current} onChange={(e) => setCurrent(e.target.value)} />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="new-password">{t.newPassword}</Label>
            <Input id="new-password" type="password" autoComplete="new-password" maxLength={128} value={next} onChange={(e) => setNext(e.target.value)} aria-invalid={tooShort} />
            {tooShort ? <p className="text-xs text-destructive">{t.passwordTooShort}</p> : null}
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="repeat-password">{t.confirmPassword}</Label>
            <Input id="repeat-password" type="password" autoComplete="new-password" maxLength={128} value={repeat} onChange={(e) => setRepeat(e.target.value)} aria-invalid={mismatch} />
            {mismatch ? <p className="text-xs text-destructive">{t.passwordsDontMatch}</p> : null}
          </div>
          <Button type="submit" disabled={!ready || busy} data-testid="change-password-submit">
            {busy ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
            {t.changePassword}
          </Button>
        </form>
      </CardContent>
    </Card>
  );
}
