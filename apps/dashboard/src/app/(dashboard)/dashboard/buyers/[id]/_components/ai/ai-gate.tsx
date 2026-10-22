'use client';

import { useState, type ReactNode } from 'react';
import Link from 'next/link';
import { Loader2, Sparkles } from 'lucide-react';
import { Button, type ButtonProps } from '@/components/ui/button';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { useToast } from '@/hooks/use-toast';
import { useBuyerText } from '../../../_i18n/use-buyer-text';
import type { ApiError } from '../../../use-buyers';
import { useAiStatus } from '../../../use-buyer-ai';

export const AI_SETTINGS_URL = '/dashboard/settings?tab=ai';

// "AI needs your OpenRouter key", with the way to Settings → AI.
export function NoKeyDialog({ open, onOpenChange }: { open: boolean; onOpenChange: (open: boolean) => void }) {
  const t = useBuyerText().ai;
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md" data-testid="ai-no-key">
        <DialogHeader>
          <DialogTitle>{t.noKeyTitle}</DialogTitle>
          <DialogDescription>{t.noKey}</DialogDescription>
        </DialogHeader>
        <DialogFooter className="gap-2">
          <Button variant="outline" onClick={() => onOpenChange(false)}>{t.close}</Button>
          <Button asChild>
            <Link href={AI_SETTINGS_URL}>{t.openSettings}</Link>
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// Errors from an AI call: a missing key opens the dialog above (the key may
// have been removed since the page loaded), anything else is a toast.
export function useAiFailure() {
  const t = useBuyerText().ai;
  const { toast } = useToast();
  const [noKey, setNoKey] = useState(false);
  const notify = (err: unknown) => {
    const e = err as ApiError;
    if (e?.code === 'NO_AI_KEY') setNoKey(true);
    else toast({ title: t.failed, description: e?.code === 'AI_UNREADABLE' ? t.unreadable : e?.message, variant: 'destructive' });
  };
  return { notify, dialog: <NoKeyDialog open={noKey} onOpenChange={setNoKey} /> };
}

// A button for an AI action. Without a saved key it explains instead of
// calling the API.
export function AiButton({
  onClick,
  pending,
  children,
  icon,
  ...props
}: Omit<ButtonProps, 'onClick'> & { onClick: () => void; pending?: boolean; children: ReactNode; icon?: ReactNode }) {
  const status = useAiStatus();
  const [noKey, setNoKey] = useState(false);
  return (
    <>
      <Button
        {...props}
        disabled={props.disabled || pending}
        data-ai-key={status.data ? String(status.data.hasKey) : undefined}
        onClick={() => (status.data && !status.data.hasKey ? setNoKey(true) : onClick())}
      >
        {pending ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : icon ?? <Sparkles className="mr-2 h-4 w-4" />}
        {children}
      </Button>
      <NoKeyDialog open={noKey} onOpenChange={setNoKey} />
    </>
  );
}
