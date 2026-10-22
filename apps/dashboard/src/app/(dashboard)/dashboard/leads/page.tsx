'use client';

import { useEffect, useState } from 'react';
import { CheckCircle2, ExternalLink, Inbox, Loader2, Mail, Phone, Reply, RotateCcw, Trash2, UserPlus } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { PageNumbers } from '@/components/ui/page-numbers';
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
import { useToast } from '@/hooks/use-toast';
import { useDashboardAddons } from '@/hooks/use-dashboard-addons';
import { useBuyerText } from '../buyers/_i18n/use-buyer-text';
import { BUYER_ROLES, type BuyerRole } from '../buyers/use-buyers';
import { FilterSelect } from '../buyers/_components/filter-select';
import { useLanguage } from '@/i18n/i18n-provider';
import { useNewLeadText } from './_i18n';
import type { NewLeadText } from './_i18n/en';
import {
  useAssignNewLeadRole,
  useDeleteNewLead,
  useNewLeads,
  useSetNewLeadHandled,
  type NewLead,
  type NewLeadForm,
  type NewLeadView,
} from './use-new-leads';

// New Leads: people a website form created. Pick a role → they move to
// Contacts (the Buyer Match list); spam is deleted. Without Buyer Match this
// is the client's enquiry inbox: reply, then mark handled (kept under
// Handled, and can still go to Contacts once Buyer Match is switched on).

function formLabel(f: NewLeadForm, text: NewLeadText): string {
  if (f.metadata?.kind === 'favorites') return text.forms.favorites;
  if (f.type === 'enquiry') return text.forms.enquiry;
  if (f.type === 'wishlist_form') return text.forms.wishlist_form;
  return text.forms.other;
}

// pageUrl comes from a public form: only real web links become a link.
function webUrl(url?: string | null): string | null {
  try {
    const u = new URL(url ?? '');
    return u.protocol === 'http:' || u.protocol === 'https:' ? u.href : null;
  } catch {
    return null;
  }
}

function LeadCard({
  lead,
  onDelete,
  inbox,
  view,
}: {
  lead: NewLead;
  onDelete: (lead: NewLead) => void;
  // No Buyer Match: no Contacts to add them to.
  inbox: boolean;
  view: NewLeadView;
}) {
  const bt = useBuyerText();
  const text = useNewLeadText();
  const { locale } = useLanguage();
  const { toast } = useToast();
  const assign = useAssignNewLeadRole();
  const handled = useSetNewLeadHandled();
  const [role, setRole] = useState<BuyerRole | ''>('');
  const name = [lead.firstName, lead.lastName].filter(Boolean).join(' ') || text.noName;
  const [latest, ...earlier] = lead.forms;
  const pageUrl = webUrl(latest?.metadata?.pageUrl);
  const property = latest?.metadata?.reference
    ? [latest.metadata.reference, latest.metadata.title].filter(Boolean).join(' · ')
    : latest?.metadata?.references?.join(', ');

  const replyHref = lead.email
    ? `mailto:${lead.email}?subject=${encodeURIComponent(text.replySubject(latest?.metadata?.reference || latest?.metadata?.title || undefined))}`
    : null;

  const setHandled = async (value: boolean) => {
    try {
      await handled.mutateAsync({ id: lead.id, handled: value });
      toast({ title: value ? text.markedHandled : text.reopened });
    } catch (e) {
      toast({ title: text.handledFailed, description: (e as Error).message, variant: 'destructive' });
    }
  };

  const save = async () => {
    if (!role) return;
    try {
      await assign.mutateAsync({ id: lead.id, role });
      toast({ title: text.added(bt.roles[role] ?? role) });
    } catch (e) {
      toast({ title: text.addFailed, description: (e as Error).message, variant: 'destructive' });
    }
  };

  return (
    <Card data-testid="new-lead">
      <CardContent className="flex flex-col gap-4 p-4 lg:flex-row lg:items-start">
        <div className="min-w-0 flex-1 space-y-2">
          <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
            <span className="text-base font-semibold">{name}</span>
            <span className="text-xs text-muted-foreground">{new Date(lead.createdAt).toLocaleString(locale)}</span>
            <span className="text-xs text-muted-foreground">
              {bt.sources[lead.source as keyof typeof bt.sources] ?? lead.source}
            </span>
            {view === 'handled' && lead.handledAt && (
              <span className="flex items-center gap-1 text-xs text-muted-foreground">
                <CheckCircle2 className="h-3.5 w-3.5" />
                {text.handledOn(new Date(lead.handledAt).toLocaleDateString(locale))}
              </span>
            )}
          </div>
          <div className="flex flex-wrap gap-x-4 gap-y-1 text-sm text-muted-foreground">
            {lead.email && (
              <a href={`mailto:${lead.email}`} className="flex items-center gap-1 hover:text-foreground">
                <Mail className="h-3.5 w-3.5" />
                {lead.email}
              </a>
            )}
            {lead.phone && (
              <a href={`tel:${lead.phone}`} className="flex items-center gap-1 hover:text-foreground">
                <Phone className="h-3.5 w-3.5" />
                {lead.phone}
              </a>
            )}
            <span>
              {text.agent}: {lead.agent?.name || text.unassigned}
            </span>
          </div>
          {latest && (
            <div className="rounded-md bg-muted/50 p-3 text-sm">
              <div className="mb-1 flex flex-wrap items-center gap-x-2 text-xs font-medium text-muted-foreground">
                <span>{formLabel(latest, text)}</span>
                {property && <span>· {property}</span>}
                {pageUrl && (
                  <a
                    href={pageUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="flex items-center gap-0.5 text-primary hover:underline"
                  >
                    {text.viewPage}
                    <ExternalLink className="h-3 w-3" />
                  </a>
                )}
              </div>
              <p className="whitespace-pre-line">{latest.message || <span className="text-muted-foreground">{text.noMessage}</span>}</p>
              {earlier.length > 0 && <p className="mt-1 text-xs text-muted-foreground">{text.moreForms(earlier.length)}</p>}
            </div>
          )}
        </div>
        <div className="flex shrink-0 flex-wrap items-center gap-2 lg:w-[180px] lg:flex-col lg:items-stretch">
          {!inbox && (
            <>
              <FilterSelect
                value={role}
                onChange={(v) => setRole(v as BuyerRole | '')}
                anyLabel={text.chooseRole}
                options={BUYER_ROLES.map((r) => ({ value: r, label: bt.roles[r] }))}
                className="w-[180px]"
              />
              <Button size="sm" onClick={save} disabled={!role || assign.isPending} data-testid="new-lead-add">
                {assign.isPending ? <Loader2 className="mr-1.5 h-4 w-4 animate-spin" /> : <UserPlus className="mr-1.5 h-4 w-4" />}
                {text.addToContacts}
              </Button>
            </>
          )}
          {inbox && replyHref && (
            <Button size="sm" asChild data-testid="new-lead-reply">
              <a href={replyHref}>
                <Reply className="mr-1.5 h-4 w-4" />
                {text.reply}
              </a>
            </Button>
          )}
          {inbox && view === 'waiting' && (
            <Button size="sm" variant="outline" onClick={() => setHandled(true)} disabled={handled.isPending} data-testid="new-lead-handled">
              {handled.isPending ? <Loader2 className="mr-1.5 h-4 w-4 animate-spin" /> : <CheckCircle2 className="mr-1.5 h-4 w-4" />}
              {text.markHandled}
            </Button>
          )}
          {view === 'handled' && (
            <Button size="sm" variant="outline" onClick={() => setHandled(false)} disabled={handled.isPending} data-testid="new-lead-reopen">
              {handled.isPending ? <Loader2 className="mr-1.5 h-4 w-4 animate-spin" /> : <RotateCcw className="mr-1.5 h-4 w-4" />}
              {text.reopen}
            </Button>
          )}
          <Button size="sm" variant="ghost" className="text-muted-foreground hover:text-destructive" onClick={() => onDelete(lead)}>
            <Trash2 className="mr-1.5 h-4 w-4" />
            {text.delete}
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}

export default function NewLeadsPage() {
  const text = useNewLeadText();
  const { toast } = useToast();
  const [page, setPage] = useState(1);
  const [view, setView] = useState<NewLeadView>('waiting');
  const [deleting, setDeleting] = useState<NewLead | null>(null);
  const { addons, known } = useDashboardAddons();
  // The server renders before the add-ons are known; deciding after mount
  // keeps the first client render the same (no hydration mismatch). Until
  // then, the usual Buyer Match card (no wrong lock).
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);
  const inbox = mounted && known && !addons.buyerMatch;
  const query = useNewLeads(page, view);
  const remove = useDeleteNewLead();
  const leads = query.data?.data ?? [];
  const total = query.data?.total ?? 0;
  const pages = Math.max(1, Math.ceil(total / (query.data?.limit ?? 20)));

  const confirmDelete = async () => {
    if (!deleting) return;
    try {
      await remove.mutateAsync(deleting.id);
      toast({ title: text.deleted });
    } catch (e) {
      toast({ title: text.deleteFailed, description: (e as Error).message, variant: 'destructive' });
    } finally {
      setDeleting(null);
    }
  };

  return (
    <div className="space-y-6 animate-fade-in">
      <div className="page-header">
        <div>
          <h1 className="page-title">{text.title}</h1>
          <p className="page-description mt-1">{inbox ? text.descriptionInbox : text.description}</p>
        </div>
        {total > 0 && (
          <span className="text-sm text-muted-foreground">{view === 'handled' ? text.totalHandled(total) : text.total(total)}</span>
        )}
      </div>

      <div className="inline-flex rounded-lg border bg-muted/40 p-1" role="tablist">
        {(['waiting', 'handled'] as const).map((v) => (
          <button
            key={v}
            type="button"
            role="tab"
            aria-selected={view === v}
            onClick={() => {
              setView(v);
              setPage(1);
            }}
            className={`rounded-md px-3 py-1.5 text-sm font-medium transition-colors ${
              view === v ? 'bg-background text-foreground shadow-sm' : 'text-muted-foreground hover:text-foreground'
            }`}
          >
            {v === 'waiting' ? text.tabWaiting : text.tabHandled}
          </button>
        ))}
      </div>

      {query.isLoading ? (
        <div className="flex justify-center py-12">
          <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
        </div>
      ) : query.isError ? (
        <Card>
          <CardContent className="flex flex-col items-center gap-3 py-12 text-sm text-muted-foreground">
            {text.loadFailed}
            <Button variant="outline" size="sm" onClick={() => query.refetch()}>
              {text.retry}
            </Button>
          </CardContent>
        </Card>
      ) : leads.length === 0 ? (
        <Card>
          <CardContent className="flex flex-col items-center gap-3 py-12 text-sm text-muted-foreground">
            <Inbox className="h-8 w-8" />
            {view === 'handled' ? text.emptyHandled : text.empty}
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-3">
          {leads.map((lead) => (
            <LeadCard key={lead.id} lead={lead} onDelete={setDeleting} inbox={inbox} view={view} />
          ))}
          {pages > 1 && <PageNumbers page={page} pages={pages} onChange={setPage} />}
        </div>
      )}

      <AlertDialog open={deleting !== null} onOpenChange={(open) => !open && setDeleting(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{text.deleteTitle}</AlertDialogTitle>
            <AlertDialogDescription>{text.deleteText}</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>{text.cancel}</AlertDialogCancel>
            <AlertDialogAction onClick={confirmDelete} className="bg-destructive text-destructive-foreground hover:bg-destructive/90">
              {text.delete}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
