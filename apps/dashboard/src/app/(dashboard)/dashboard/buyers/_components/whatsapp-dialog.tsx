'use client';

import { Fragment, useEffect, useState } from 'react';
import { AlertTriangle, Copy, Loader2, MessageCircle } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Textarea } from '@/components/ui/textarea';
import { useToast } from '@/hooks/use-toast';
import { useBuyerText } from '../_i18n/use-buyer-text';
import { useTenantLanguages } from '../use-buyers';
import { useEmailIntro } from '../use-buyer-ai';
import { useWhatsAppOpen, useWhatsAppPreview, type WhatsAppBody, type WhatsAppKind } from '../use-whatsapp';
import { FilterSelect } from './filter-select';
import { useCalendarText } from '../_i18n/calendar';
import { AiButton, useAiFailure } from '../[id]/_components/ai/ai-gate';

const LANG_NAMES: Record<string, string> = {
  en: 'English', es: 'Español', nl: 'Nederlands', de: 'Deutsch', fr: 'Français', it: 'Italiano', pt: 'Português',
  ru: 'Русский', sv: 'Svenska', no: 'Norsk', da: 'Dansk', pl: 'Polski', fi: 'Suomi', cs: 'Čeština',
};
const OTHER = 'other';

// WhatsApp click-to-chat, from every place that sends one: Buyer Match tabs
// (properties), New Leads (enquiry), viewings and tasks. The API builds the
// text; "Open WhatsApp" opens the agent's WhatsApp with it typed in, and
// "Copy text" is for pasting it into a phone. Either counts as sent.
export function WhatsAppDialog({
  base,
  kind,
  propertyIds,
  viewingId,
  taskId,
  aiBuyerId,
  handledOption,
  open,
  onOpenChange,
  onDone,
}: {
  base: string;
  kind: WhatsAppKind;
  propertyIds?: number[];
  viewingId?: number;
  taskId?: number;
  // The buyer whose AI writes the opening (properties only).
  aiBuyerId?: number;
  // New Leads inbox: offer "mark the enquiry as handled".
  handledOption?: boolean;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onDone?: () => void;
}) {
  const all = useBuyerText();
  const t = all.whatsapp;
  const cal = useCalendarText();
  const { toast } = useToast();
  const langs = useTenantLanguages();
  const preview = useWhatsAppPreview(base);
  const opener = useWhatsAppOpen(base);
  const intro = useEmailIntro(aiBuyerId ?? 0);
  const failure = useAiFailure();

  const [lang, setLang] = useState<string | undefined>();
  const [message, setMessage] = useState('');
  const [touched, setTouched] = useState(false);
  const [shownMessage, setShownMessage] = useState('');
  const [phone, setPhone] = useState('');
  const [other, setOther] = useState('');
  const [allowResend, setAllowResend] = useState(false);
  const [markTaskDone, setMarkTaskDone] = useState(true);
  const [markHandled, setMarkHandled] = useState(true);
  // On by default: the API adds the line only when Calendly has a booking page.
  const [withBooking, setWithBooking] = useState(true);

  useEffect(() => {
    if (!open) return;
    setLang(undefined);
    setMessage('');
    setTouched(false);
    setShownMessage('');
    setPhone('');
    setOther('');
    setAllowResend(false);
    setMarkTaskDone(true);
    setMarkHandled(true);
    setWithBooking(true);
  }, [open]);

  const body: WhatsAppBody = {
    kind,
    ...(propertyIds?.length ? { propertyIds } : {}),
    ...(viewingId ? { viewingId } : {}),
    ...(taskId ? { taskId } : {}),
    ...(lang ? { lang } : {}),
    ...(touched && shownMessage ? { message: shownMessage } : {}),
    allowResend,
    ...(kind === 'enquiry' || kind === 'follow_up' ? { withBooking } : {}),
  };
  const previewKey = JSON.stringify(body);
  useEffect(() => {
    if (open) preview.mutate(body);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, previewKey]);

  const data = preview.data;
  // The template fills the box until the agent types their own.
  useEffect(() => {
    if (data && !touched) setMessage(data.message);
    if (data && !phone) setPhone(data.phones[0]?.digits ?? OTHER);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [data]);

  const phones = data?.phones ?? [];
  const picked = phone === OTHER ? null : phones.find((p) => p.digits === phone) ?? null;
  const typed = other.trim();
  const international = picked ? picked.international : /^(\+|00)/.test(typed);
  const hasNumber = picked ? true : typed.replace(/\D/g, '').length >= 7;
  const languages = langs.data?.length ? langs.data : ['en'];
  const shownLang = lang ?? data?.lang ?? languages[0];
  const skipped = data?.skipped ?? [];
  const allSkipped = !allowResend && !!data?.allSkipped;

  const finalBody = (): WhatsAppBody => ({
    ...body,
    ...(message.trim() ? { message: message.trim() } : {}),
    ...(picked ? { phone: `+${picked.digits}` } : { phone: typed }),
    ...(kind === 'follow_up' && taskId ? { markTaskDone } : {}),
    ...(handledOption ? { markHandled } : {}),
  });

  const fail = (err: unknown) => toast({ title: t.failed, description: (err as Error).message, variant: 'destructive' });
  const finish = () => {
    onOpenChange(false);
    onDone?.();
  };

  const openWhatsApp = async () => {
    // Opened now, while the click still counts: a tab opened after the
    // request returns is blocked as a popup.
    const tab = window.open('', '_blank');
    try {
      const res = await opener.mutateAsync(finalBody());
      if (tab) {
        tab.opener = null;
        tab.location.href = res.url;
      } else {
        window.location.href = res.url;
      }
      toast({ title: t.opened });
      finish();
    } catch (err) {
      tab?.close();
      fail(err);
    }
  };

  const copyText = async () => {
    try {
      const res = await opener.mutateAsync(finalBody());
      await navigator.clipboard.writeText(res.text);
      toast({ title: t.copied });
      finish();
    } catch (err) {
      fail(err);
    }
  };

  const busy = opener.isPending;
  const canSend = hasNumber && !allSkipped && !!data;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[92vh] max-w-3xl overflow-y-auto" data-testid="whatsapp-dialog">
        <DialogHeader>
          <DialogTitle>{t.title(kind, propertyIds?.length ?? 0)}</DialogTitle>
          <DialogDescription>{t.description}</DialogDescription>
        </DialogHeader>

        <div className="grid gap-4 sm:grid-cols-2">
          <div className="space-y-2">
            <Label>{t.to}</Label>
            {phones.length ? (
              <Select value={phone || OTHER} onValueChange={setPhone}>
                <SelectTrigger data-testid="whatsapp-phone">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {phones.map((p) => (
                    <SelectItem key={p.digits} value={p.digits}>{`${t.labels[p.label] ?? p.label} · ${p.number}`}</SelectItem>
                  ))}
                  <SelectItem value={OTHER}>{t.other}</SelectItem>
                </SelectContent>
              </Select>
            ) : data ? (
              <p className="text-sm text-muted-foreground">{t.noPhone}</p>
            ) : null}
            {phone === OTHER || (data && !phones.length) ? (
              <Input value={other} onChange={(e) => setOther(e.target.value)} placeholder="+34 600 000 000" inputMode="tel" data-testid="whatsapp-other" />
            ) : null}
            {hasNumber && !international ? (
              <p className="flex items-start gap-1.5 text-xs text-amber-700 dark:text-amber-300" data-testid="whatsapp-no-country">
                <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0" />
                {t.noCountryCode}
              </p>
            ) : null}
          </div>
          <div className="space-y-2">
            <Label>{t.language}</Label>
            <FilterSelect
              className="w-full"
              value={shownLang}
              onChange={(v) => setLang(v || languages[0])}
              anyLabel={LANG_NAMES[languages[0]] ?? languages[0]}
              options={Array.from(new Set([...languages, shownLang])).map((l) => ({ value: l, label: LANG_NAMES[l] ?? l }))}
            />
          </div>
        </div>

        <div className="space-y-1.5">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <Label htmlFor="whatsapp-message">{t.message}</Label>
            {kind === 'properties' && aiBuyerId && propertyIds?.length ? (
              <AiButton
                size="sm"
                variant="outline"
                className="h-8"
                pending={intro.isPending}
                title={all.ai.intro.hint}
                data-testid="whatsapp-ai"
                onClick={async () => {
                  try {
                    const out = await intro.mutateAsync({ propertyIds, lang: shownLang, channel: 'whatsapp' });
                    setMessage(out.text);
                    setTouched(true);
                    setShownMessage(out.text);
                  } catch (err) {
                    failure.notify(err);
                  }
                }}
              >
                {touched ? all.ai.intro.again : all.ai.intro.write}
              </AiButton>
            ) : null}
          </div>
          <Textarea
            id="whatsapp-message"
            rows={message.length > 160 ? 5 : 3}
            value={message}
            onChange={(e) => {
              setMessage(e.target.value);
              setTouched(true);
            }}
            onBlur={() => setShownMessage(message.trim())}
            maxLength={3000}
            data-testid="whatsapp-message"
          />
        </div>

        {data?.unsubscribed ? (
          <p className="flex items-start gap-2 rounded-md border border-amber-300 bg-amber-50 p-3 text-sm text-amber-900 dark:bg-amber-950/30 dark:text-amber-200">
            <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
            {t.unsubscribed}
          </p>
        ) : null}

        {skipped.length && !allowResend ? (
          <div className="space-y-2 rounded-md border border-amber-300 bg-amber-50 p-3 text-sm text-amber-900 dark:bg-amber-950/30 dark:text-amber-200" data-testid="whatsapp-skipped">
            <p className="flex items-start gap-2">
              <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
              {allSkipped ? all.send.allSkipped : all.send.skipped(skipped.map((s) => s.reference).join(', '))}
            </p>
            <label className="flex items-center gap-2">
              <Checkbox checked={allowResend} onCheckedChange={(v) => setAllowResend(!!v)} aria-label={all.send.includeSkipped} />
              {all.send.includeSkipped}
            </label>
          </div>
        ) : allowResend ? (
          <label className="flex items-center gap-2 text-sm">
            <Checkbox checked={allowResend} onCheckedChange={(v) => setAllowResend(!!v)} aria-label={all.send.includeSkipped} />
            {all.send.includeSkipped}
          </label>
        ) : null}

        <div className="space-y-1.5">
          <div className="flex items-center justify-between gap-2">
            <Label>{t.preview}</Label>
            {data ? <span className="text-xs text-muted-foreground">{t.chars(data.text.length)}</span> : null}
          </div>
          <div className="rounded-md border bg-[#efeae2] p-4 dark:bg-[#0b141a]">
            {preview.isPending && !data ? (
              <div className="flex h-24 items-center justify-center"><Loader2 className="h-5 w-5 animate-spin text-muted-foreground" /></div>
            ) : preview.isError ? (
              <p className="text-sm text-destructive">{t.previewFailed}</p>
            ) : data ? (
              <div
                className="ml-auto max-w-[85%] whitespace-pre-wrap break-words rounded-lg rounded-tr-none bg-[#d9fdd3] px-3 py-2 text-sm text-[#111b21] shadow-sm dark:bg-[#005c4b] dark:text-[#e9edef]"
                data-testid="whatsapp-bubble"
              >
                <Bubble text={data.text} />
              </div>
            ) : null}
          </div>
          {kind === 'properties' ? <p className="text-xs text-muted-foreground">{t.tracked}</p> : null}
        </div>

        {kind === 'follow_up' && taskId ? (
          <label className="flex items-center gap-2 text-sm">
            <Checkbox checked={markTaskDone} onCheckedChange={(v) => setMarkTaskDone(!!v)} aria-label={t.markTaskDone} />
            {t.markTaskDone}
          </label>
        ) : null}
        {data?.bookingAvailable ? (
          <label className="flex items-center gap-2 text-sm">
            <Checkbox checked={withBooking} onCheckedChange={(v) => setWithBooking(!!v)} aria-label={cal.withBooking} data-testid="whatsapp-booking" />
            {cal.withBooking}
          </label>
        ) : null}
        {handledOption ? (
          <label className="flex items-center gap-2 text-sm">
            <Checkbox checked={markHandled} onCheckedChange={(v) => setMarkHandled(!!v)} aria-label={t.markHandled} />
            {t.markHandled}
          </label>
        ) : null}

        <DialogFooter className="gap-2">
          <Button variant="outline" onClick={() => onOpenChange(false)}>{t.cancel}</Button>
          <Button variant="outline" onClick={copyText} disabled={busy || !canSend} data-testid="whatsapp-copy">
            <Copy className="mr-2 h-4 w-4" />
            {t.copy}
          </Button>
          <Button onClick={openWhatsApp} disabled={busy || !canSend} className="bg-[#25d366] text-white hover:bg-[#1ebe5b]" data-testid="whatsapp-open">
            {busy ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <MessageCircle className="mr-2 h-4 w-4" />}
            {busy ? t.opening : t.open}
          </Button>
        </DialogFooter>
        {failure.dialog}
      </DialogContent>
    </Dialog>
  );
}

// WhatsApp's own *bold*, as WhatsApp shows it.
function Bubble({ text }: { text: string }) {
  const parts = text.split(/(\*[^*\n]+\*)/g);
  return (
    <>
      {parts.map((part, i) =>
        /^\*[^*\n]+\*$/.test(part) ? <strong key={i}>{part.slice(1, -1)}</strong> : <Fragment key={i}>{part}</Fragment>,
      )}
    </>
  );
}
