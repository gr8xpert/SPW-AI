'use client';

import { ChevronDown, Mail, MessageCircle, Phone } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import {
  DropdownMenu, DropdownMenuCheckboxItem, DropdownMenuContent, DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { Label } from '@/components/ui/label';
import { useToast } from '@/hooks/use-toast';
import { cn } from '@/lib/utils';
import { useBuyerText } from '../../_i18n/use-buyer-text';
import {
  BUYER_ROLES, buyerName, daysSince, stageName, useBuyerAgents, useBuyerSettings, useBuyerStages, useSetBuyerStage,
  useUpdateBuyer, type Buyer, type UpdateBuyerInput,
} from '../../use-buyers';
import { BuyerAvatar, PriorityStars } from '../../_components/buyer-bits';
import { FilterSelect } from '../../_components/filter-select';
import { PrivacyMenu } from './privacy-menu';
import { dashboardLocale } from '@/i18n/i18n-provider';

export function BuyerHeader({ buyer }: { buyer: Buyer }) {
  const t = useBuyerText();
  const { toast } = useToast();
  const update = useUpdateBuyer(buyer.id);
  const setStage = useSetBuyerStage(buyer.id);
  const stages = useBuyerStages();
  const agents = useBuyerAgents();
  const settings = useBuyerSettings();

  const name = buyerName(buyer);
  const relatedIds = buyer.agents.map((a) => a.userId);
  const days = daysSince(buyer.lastActivityAt);
  const stale = buyer.stage?.kind === 'open' && days !== null && days >= (settings.data?.staleDays ?? 14);
  const phone = buyer.mobile || buyer.phone;
  const waDigits = phone?.replace(/\D/g, '');

  const save = async (body: UpdateBuyerInput) => {
    try {
      await update.mutateAsync(body);
    } catch (err) {
      toast({ title: t.record.saveFailed, description: (err as Error).message, variant: 'destructive' });
    }
  };

  const moveTo = async (stageId: string) => {
    if (!stageId) return;
    try {
      await setStage.mutateAsync(Number(stageId));
    } catch (err) {
      toast({ title: t.record.saveFailed, description: (err as Error).message, variant: 'destructive' });
    }
  };

  const toggleRelated = (userId: number, on: boolean) => {
    const next = on ? [...relatedIds, userId] : relatedIds.filter((id) => id !== userId);
    void save({ agentIds: next });
  };

  return (
    <Card>
      <CardContent className="space-y-5 p-6">
        <div className="flex flex-wrap items-start gap-4">
          <BuyerAvatar name={name} photoUrl={buyer.photoUrl} className="h-14 w-14" />
          <div className="min-w-0 flex-1 space-y-1">
            <div className="flex flex-wrap items-center gap-3">
              <h1 className="text-2xl font-semibold tracking-tight">{name}</h1>
              <PriorityStars size="md" value={buyer.priority} onChange={(priority) => save({ priority })} />
              {stale ? (
                <span className="rounded-full bg-amber-100 px-2 py-0.5 text-xs font-medium text-amber-800">
                  {t.stale}: {t.daysAgo(days!)}
                </span>
              ) : null}
              {buyer.unsubscribedAt && !buyer.erasedAt ? (
                <span className="rounded-full bg-slate-200 px-2 py-0.5 text-xs font-medium text-slate-700 dark:bg-slate-800 dark:text-slate-300" data-testid="badge-unsubscribed" title={t.privacy.unsubscribedOn(new Date(buyer.unsubscribedAt).toLocaleDateString(dashboardLocale()))}>
                  {t.privacy.unsubscribed}
                </span>
              ) : null}
              <span className="ml-auto"><PrivacyMenu buyer={buyer} /></span>
            </div>
            {buyer.erasedAt ? (
              <p className="rounded-md border border-dashed bg-muted/40 px-3 py-2 text-sm text-muted-foreground" data-testid="erased-notice">{t.privacy.erasedNotice}</p>
            ) : null}
            <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-sm text-muted-foreground">
              {buyer.contact?.email && !buyer.erasedAt ? (
                <a className="flex items-center gap-1.5 hover:text-foreground" href={`mailto:${buyer.contact.email}`}>
                  <Mail className="h-3.5 w-3.5" />
                  {buyer.contact.email}
                </a>
              ) : null}
              {phone ? (
                <a className="flex items-center gap-1.5 hover:text-foreground" href={`tel:${phone.replace(/\s/g, '')}`}>
                  <Phone className="h-3.5 w-3.5" />
                  {phone}
                </a>
              ) : null}
            </div>
          </div>
          {waDigits && waDigits.length >= 7 ? (
            <Button variant="outline" size="sm" asChild>
              <a href={`https://wa.me/${waDigits}`} target="_blank" rel="noopener noreferrer">
                <MessageCircle className="mr-1.5 h-4 w-4" />
                {t.record.whatsapp}
              </a>
            </Button>
          ) : null}
        </div>

        <div className="space-y-1.5">
          <Label>{t.record.role}</Label>
          <div role="radiogroup" className="flex flex-wrap gap-1.5">
            {BUYER_ROLES.map((r) => (
              <button
                key={r}
                type="button"
                role="radio"
                aria-checked={buyer.role === r}
                onClick={() => buyer.role !== r && save({ role: r })}
                className={cn(
                  'rounded-full border px-3 py-1 text-xs transition-colors',
                  buyer.role === r ? 'border-primary bg-primary text-primary-foreground' : 'hover:bg-muted',
                )}
              >
                {t.roles[r]}
              </button>
            ))}
          </div>
        </div>

        <div className="grid gap-4 sm:grid-cols-3">
          <div className="space-y-1.5">
            <Label>{t.record.stage}</Label>
            <FilterSelect
              className="w-full"
              value={buyer.stageId ? String(buyer.stageId) : ''}
              onChange={moveTo}
              anyLabel="—"
              options={(stages.data ?? []).map((s) => ({ value: String(s.id), label: stageName(s) }))}
            />
          </div>
          <div className="space-y-1.5">
            <Label>{t.record.agent}</Label>
            <FilterSelect
              className="w-full"
              value={buyer.assignedTo ? String(buyer.assignedTo) : ''}
              onChange={(v) => save({ assignedTo: v ? Number(v) : null })}
              anyLabel={t.unassigned}
              options={(agents.data ?? []).map((a) => ({ value: String(a.id), label: a.name || a.email }))}
            />
          </div>
          <div className="space-y-1.5">
            <Label>{t.record.relatedAgents}</Label>
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button variant="outline" className="h-9 w-full justify-between font-normal">
                  <span className="truncate">
                    {buyer.agents.length
                      ? buyer.agents.map((a) => a.user?.name || a.user?.email).filter(Boolean).join(', ')
                      : t.record.noRelatedAgents}
                  </span>
                  <ChevronDown className="h-4 w-4 opacity-50" />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent className="w-56">
                {(agents.data ?? [])
                  .filter((a) => a.id !== buyer.assignedTo)
                  .map((a) => (
                    <DropdownMenuCheckboxItem
                      key={a.id}
                      checked={relatedIds.includes(a.id)}
                      onCheckedChange={(on) => toggleRelated(a.id, !!on)}
                      onSelect={(e) => e.preventDefault()}
                    >
                      {a.name || a.email}
                    </DropdownMenuCheckboxItem>
                  ))}
              </DropdownMenuContent>
            </DropdownMenu>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
