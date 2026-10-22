'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { useSession } from 'next-auth/react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { ChevronDown, ShieldCheck } from 'lucide-react';
import { Button } from '@/components/ui/button';
import {
  Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle,
} from '@/components/ui/dialog';
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuLabel, DropdownMenuSeparator, DropdownMenuSub,
  DropdownMenuSubContent, DropdownMenuSubTrigger, DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { Input } from '@/components/ui/input';
import { useApi } from '@/hooks/use-api';
import { useToast } from '@/hooks/use-toast';
import { useBuyerText } from '../../_i18n/use-buyer-text';
import { buyerKeys, type Buyer } from '../../use-buyers';
import { dashboardLocale } from '@/i18n/i18n-provider';

const MANAGERS = new Set(['admin', 'webmaster', 'super_admin']);
const SOURCES = ['website', 'form', 'email', 'phone', 'in_person', 'import', 'other'];
const day = (d: string) => new Date(d).toLocaleDateString(dashboardLocale());

// The record's Privacy menu (milestone J): consent, unsubscribe from property
// emails, and (managers) erase.
export function PrivacyMenu({ buyer }: { buyer: Buyer }) {
  const p = useBuyerText().privacy;
  const api = useApi();
  const router = useRouter();
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const { data: session } = useSession();
  const manager = MANAGERS.has(String(session?.user?.role ?? ''));
  const [erasing, setErasing] = useState(false);
  const [typed, setTyped] = useState('');

  const act = useMutation({
    mutationFn: async (fn: () => Promise<unknown>) => fn(),
    onSuccess: () => {
      toast({ title: p.done });
      void queryClient.invalidateQueries({ queryKey: buyerKeys.all });
    },
    onError: (e: Error) => toast({ title: p.done, description: e.message, variant: 'destructive' }),
  });
  const base = `/api/dashboard/buyers/${buyer.id}`;

  if (buyer.erasedAt) return null;
  return (
    <>
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button variant="outline" size="sm" data-testid="privacy-menu">
            <ShieldCheck className="mr-1.5 h-4 w-4" />
            {p.menu}
            <ChevronDown className="ml-1 h-3.5 w-3.5" />
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end" className="w-72">
          <DropdownMenuLabel className="text-xs font-normal text-muted-foreground">
            {buyer.consentAt ? p.consentOn(day(buyer.consentAt), p.sources[buyer.consentSource ?? 'other'] ?? '') : p.consentNone}
          </DropdownMenuLabel>
          {buyer.consentAt ? (
            <DropdownMenuItem onSelect={() => act.mutate(() => api.put(`${base}/consent`, { on: false }))}>{p.withdraw}</DropdownMenuItem>
          ) : (
            <DropdownMenuSub>
              <DropdownMenuSubTrigger data-testid="consent-record">{p.recordConsent}</DropdownMenuSubTrigger>
              <DropdownMenuSubContent>
                {SOURCES.map((s) => (
                  <DropdownMenuItem key={s} data-consent={s} onSelect={() => act.mutate(() => api.put(`${base}/consent`, { on: true, source: s }))}>
                    {p.sources[s]}
                  </DropdownMenuItem>
                ))}
              </DropdownMenuSubContent>
            </DropdownMenuSub>
          )}
          <DropdownMenuSeparator />
          {buyer.unsubscribedAt ? (
            <>
              <DropdownMenuLabel className="text-xs font-normal text-muted-foreground">{p.unsubscribedOn(day(buyer.unsubscribedAt))}</DropdownMenuLabel>
              <DropdownMenuItem data-testid="resubscribe" onSelect={() => act.mutate(() => api.post(`${base}/resubscribe`))}>{p.resubscribe}</DropdownMenuItem>
            </>
          ) : (
            <DropdownMenuItem data-testid="unsubscribe" onSelect={() => act.mutate(() => api.post(`${base}/unsubscribe`))}>{p.unsubscribe}</DropdownMenuItem>
          )}
          {manager ? (
            <>
              <DropdownMenuSeparator />
              <DropdownMenuItem className="text-destructive focus:text-destructive" data-testid="erase-open" onSelect={() => setErasing(true)}>
                {p.erase}
              </DropdownMenuItem>
            </>
          ) : null}
        </DropdownMenuContent>
      </DropdownMenu>

      <Dialog open={erasing} onOpenChange={(o) => { setErasing(o); setTyped(''); }}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{p.eraseTitle}</DialogTitle>
            <DialogDescription>{p.eraseText}</DialogDescription>
          </DialogHeader>
          <Input placeholder={p.eraseType} value={typed} onChange={(e) => setTyped(e.target.value)} data-testid="erase-confirm" />
          <DialogFooter>
            <Button
              variant="destructive"
              disabled={typed !== 'ERASE' || act.isPending}
              data-testid="erase-do"
              onClick={() =>
                act.mutate(() => api.post(`${base}/erase`, { confirm: typed }), {
                  onSuccess: () => {
                    setErasing(false);
                    // Erased buyers leave the list, so go back to it.
                    router.push('/dashboard/buyers');
                  },
                })
              }
            >
              {p.eraseButton}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
