'use client';

import { useState } from 'react';
import Link from 'next/link';
import {
  ArrowRightLeft, Bell, Calendar, CalendarCheck, FileText, Globe, Handshake, Loader2, Mail, MessageCircle, MessageSquare, Mic, Phone, Send, ThumbsUp, UserCog, Users,
  type LucideIcon,
} from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Textarea } from '@/components/ui/textarea';
import { useToast } from '@/hooks/use-toast';
import { formatDate } from '@/lib/utils';
import { useBuyerText } from '../../_i18n/use-buyer-text';
import {
  stageName, useAddBuyerActivity, useBuyer, useBuyerActivities, useBuyerAgents, useBuyerStages, type BuyerActivity,
} from '../../use-buyers';
import { AiButton } from './ai/ai-gate';
import { PasteDialog } from './ai/paste-dialog';
import { VoiceNoteDialog } from './ai/voice-note-dialog';
import { FilterSelect } from '../../_components/filter-select';

const ICONS: Record<string, LucideIcon> = {
  note: FileText, call: Phone, email: Mail, sms: MessageSquare, viewing: Calendar, meeting: Users,
  offer: Handshake, status_change: ArrowRightLeft, assignment: UserCog, enquiry: Globe, wishlist_form: Globe,
  suggestion_sent: Send, buyer_feedback: ThumbsUp, viewing_request: CalendarCheck, alert_sent: Bell, whatsapp: MessageCircle,
};
// Sent on WhatsApp (click-to-chat) rather than by email.
const viaWhatsApp = (item: { type: string; metadata?: Record<string, unknown> | null }) =>
  item.type === 'whatsapp' || (item.type === 'suggestion_sent' && item.metadata?.channel === 'whatsapp');
const MANUAL = ['note', 'call', 'email', 'sms', 'viewing', 'meeting', 'offer'] as const;
// What the buyer wrote (website forms, buyer page): can be read into the wishlist.
const FROM_BUYER = new Set(['enquiry', 'wishlist_form', 'viewing_request', 'buyer_feedback']);

export function ActivityTab({ buyerId }: { buyerId: number }) {
  const t = useBuyerText();
  const a = t.record.activity;
  const { toast } = useToast();
  const activities = useBuyerActivities(buyerId);
  const stages = useBuyerStages();
  const agents = useBuyerAgents();
  const add = useAddBuyerActivity(buyerId);
  const [type, setType] = useState<string>('');
  const [text, setText] = useState('');
  const buyer = useBuyer(buyerId);
  const [voiceOpen, setVoiceOpen] = useState(false);
  const [pasteText, setPasteText] = useState<string | null>(null);
  const erased = !!buyer.data?.erasedAt;

  const submit = async () => {
    try {
      await add.mutateAsync({ type: type || 'note', description: text.trim() });
      setText('');
    } catch (err) {
      toast({ title: t.record.saveFailed, description: (err as Error).message, variant: 'destructive' });
    }
  };

  const stageLabel = (id: unknown) => stageName(stages.data?.find((s) => s.id === id)) || '—';
  const agentLabel = (id: unknown) => {
    const ag = agents.data?.find((x) => x.id === id);
    return ag ? ag.name || ag.email : id ? `#${id}` : t.unassigned;
  };

  const describe = (item: BuyerActivity): string | null => {
    const m = item.metadata ?? {};
    if (item.type === 'status_change' && 'toStageId' in m) return a.stageChange(stageLabel(m.fromStageId), stageLabel(m.toStageId));
    if (item.type === 'status_change' && 'newStatus' in m) return `${m.oldStatus} → ${m.newStatus}`;
    if (item.type === 'assignment' && m.auto) return a.autoAssigned(agentLabel(m.to), String(m.mode ?? ''));
    if (item.type === 'assignment') {
      const from = 'from' in m ? m.from : m.oldAssignee;
      const to = 'to' in m ? m.to : m.newAssignee;
      return a.agentChange(agentLabel(from), agentLabel(to));
    }
    return item.description;
  };

  return (
    <div className="grid gap-6 lg:grid-cols-[1fr_2fr]">
      <Card className="h-fit">
        <CardHeader className="pb-3">
          <CardTitle className="text-base">{a.log}</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          <FilterSelect
            className="w-full"
            value={type}
            onChange={setType}
            anyLabel={a.types.note}
            options={MANUAL.filter((m) => m !== 'note').map((m) => ({ value: m, label: a.types[m] }))}
          />
          <Textarea rows={4} placeholder={a.placeholder} value={text} maxLength={5000} onChange={(e) => setText(e.target.value)} />
          <div className="flex flex-wrap justify-end gap-2">
            {buyer.data && !erased ? (
              <AiButton size="sm" variant="outline" icon={<Mic className="mr-2 h-4 w-4" />} onClick={() => setVoiceOpen(true)} data-testid="ai-voice-open">
                {t.ai.voice.button}
              </AiButton>
            ) : null}
            <Button size="sm" onClick={submit} disabled={!text.trim() || add.isPending}>
              {add.isPending ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
              {a.add}
            </Button>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardContent className="p-6">
          {activities.isLoading ? (
            <div className="flex justify-center py-8">
              <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
            </div>
          ) : !activities.data?.length ? (
            <p className="text-sm text-muted-foreground">{a.empty}</p>
          ) : (
            <ol className="relative space-y-5 border-l pl-6">
              {activities.data.map((item) => {
                const Icon = viaWhatsApp(item) ? MessageCircle : ICONS[item.type] ?? FileText;
                const who = item.user?.name || (item.type === 'enquiry' || item.type === 'wishlist_form' ? a.website : item.type === 'buyer_feedback' || item.type === 'viewing_request' ? a.buyerPage : a.system);
                const text2 = describe(item);
                return (
                  <li key={item.id} className="relative">
                    <span className="absolute -left-[37px] flex h-6 w-6 items-center justify-center rounded-full border bg-background">
                      <Icon className="h-3.5 w-3.5 text-muted-foreground" />
                    </span>
                    <div className="flex flex-wrap items-center gap-2 text-sm">
                      <span className="font-medium">{(item.type === 'suggestion_sent' && viaWhatsApp(item) ? a.types.suggestion_sent_whatsapp : a.types[item.type]) ?? item.type}</span>
                      <span className="text-muted-foreground">· {who}</span>
                      {item.fromLeadId ? <Badge variant="outline" className="text-[10px]">{a.fromEarlier}</Badge> : null}
                      {item.metadata?.via === 'voice' ? <Badge variant="secondary" className="gap-1 text-[10px]"><Mic className="h-3 w-3" />{t.ai.voice.badge}</Badge> : null}
                      <span className="ml-auto text-xs text-muted-foreground">
                        {formatDate(item.createdAt, { year: 'numeric', month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' })}
                      </span>
                    </div>
                    <WebsiteDetails item={item} />
                    {text2 ? <p className="mt-1 whitespace-pre-line text-sm text-muted-foreground">{text2}</p> : null}
                    {FROM_BUYER.has(item.type) && (item.description ?? '').trim().length >= 3 && buyer.data && !erased ? (
                      <AiButton size="sm" variant="link" className="h-auto px-0 py-1 text-xs" onClick={() => setPasteText(item.description ?? '')} data-testid="ai-read-activity">
                        {t.ai.paste.readButton}
                      </AiButton>
                    ) : null}
                  </li>
                );
              })}
            </ol>
          )}
        </CardContent>
      </Card>
      {buyer.data ? (
        <>
          <VoiceNoteDialog buyer={buyer.data} open={voiceOpen} onOpenChange={setVoiceOpen} />
          <PasteDialog buyer={buyer.data} open={pasteText !== null} onOpenChange={(o) => !o && setPasteText(null)} initialText={pasteText ?? ''} />
        </>
      ) : null}
    </div>
  );
}

// What a website entry was about: the property asked about (with a link to
// it), the favourites emailed, or the wishlist form.
function WebsiteDetails({ item }: { item: BuyerActivity }) {
  const a = useBuyerText().record.activity;
  const m = item.metadata ?? {};
  const str = (v: unknown) => (typeof v === 'string' && v ? v : null);
  const titleText = (v: unknown) =>
    str(v) ?? (v && typeof v === 'object' ? (v as Record<string, string>).en || Object.values(v as Record<string, string>)[0] || null : null);
  const badges = m.guessedWishlist ? <Badge variant="secondary" className="ml-2 text-[10px]">{a.guessedBadge}</Badge> : null;

  if (item.type === 'enquiry' && m.kind === 'favorites') {
    const refs = Array.isArray(m.references) ? (m.references as string[]).join(', ') : '';
    return (
      <p className="mt-1 text-sm">
        {str(m.recipient) ? a.favorites(m.recipient as string) : a.favoritesNoRecipient}
        {refs ? <span className="text-muted-foreground">: {refs}</span> : null}
        {badges}
      </p>
    );
  }
  if (item.type === 'enquiry' && (m.propertyId || m.reference)) {
    const label = [str(m.reference), titleText(m.title)].filter(Boolean).join(' — ');
    const page = str(m.pageUrl);
    return (
      <div className="mt-1 space-y-0.5 text-sm">
        <p>
          <span className="text-muted-foreground">{a.enquiryAbout} </span>
          {m.propertyId ? (
            <Link href={`/dashboard/properties/${m.propertyId}/edit`} className="font-medium text-primary hover:underline">
              {label || `#${m.propertyId}`}
            </Link>
          ) : (
            <span className="font-medium">{label}</span>
          )}
          {badges}
        </p>
        {page && /^https?:\/\//i.test(page) ? (
          <p className="truncate text-xs text-muted-foreground">
            {a.page}{' '}
            <a href={page} target="_blank" rel="noopener noreferrer" className="hover:underline">{page}</a>
          </p>
        ) : null}
      </div>
    );
  }
  if ((item.type === 'buyer_feedback' || item.type === 'viewing_request') && m.propertyId) {
    const label = [str(m.reference), titleText(m.title)].filter(Boolean).join(' — ');
    const what = item.type === 'viewing_request' ? a.viewingRequest : a.feedback[String(m.action)] ?? String(m.action);
    return (
      <p className="mt-1 text-sm">
        <span className="text-muted-foreground">{what}: </span>
        <Link href={`/dashboard/properties/${m.propertyId}/edit`} className="font-medium text-primary hover:underline">
          {label || `#${m.propertyId}`}
        </Link>
      </p>
    );
  }
  if (item.type === 'wishlist_form') {
    const c = (m.contact ?? {}) as Record<string, unknown>;
    const typed = [[c.firstName, c.lastName].filter(Boolean).join(' '), c.phone, c.preferredContact, c.language]
      .filter((x) => typeof x === 'string' && x)
      .join(' · ');
    return (
      <div className="mt-1 text-sm">
        <p>{a.wishlistForm}</p>
        {m.previousWishlist ? <p className="text-xs text-muted-foreground">{a.wishlistReplaced}</p> : null}
        {typed ? <p className="text-xs text-muted-foreground">{a.typedOnForm} {typed}</p> : null}
        {item.description ? <p className="mt-1 text-xs font-medium text-muted-foreground">{a.visitorNote}:</p> : null}
      </div>
    );
  }
  return null;
}
