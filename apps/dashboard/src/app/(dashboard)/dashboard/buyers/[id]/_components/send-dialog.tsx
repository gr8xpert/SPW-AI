'use client';

import { useEffect, useState } from 'react';
import { AlertTriangle, Loader2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { useToast } from '@/hooks/use-toast';
import { useBuyerText } from '../../_i18n/use-buyer-text';
import { useBuyerSettings, useTenantLanguages, type Buyer } from '../../use-buyers';
import { useSendPreview, useSendProperties } from '../../use-buyer-match';
import { FilterSelect } from '../../_components/filter-select';
import { useEmailIntro } from '../../use-buyer-ai';
import { AiButton, useAiFailure } from './ai/ai-gate';

const LANG_NAMES: Record<string, string> = {
  en: 'English', es: 'Español', nl: 'Nederlands', de: 'Deutsch', fr: 'Français', it: 'Italiano', pt: 'Português',
  ru: 'Русский', sv: 'Svenska', no: 'Norsk', da: 'Dansk', pl: 'Polski', fi: 'Suomi', cs: 'Čeština',
};

// Pick who gets the email and in which language, look at it, send it.
export function SendDialog({
  buyer,
  propertyIds,
  open,
  onOpenChange,
  onSent,
}: {
  buyer: Buyer;
  propertyIds: number[];
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSent?: () => void;
}) {
  const t = useBuyerText().send;
  const { toast } = useToast();
  const settings = useBuyerSettings();
  const langs = useTenantLanguages();
  const send = useSendProperties(buyer.id);
  const preview = useSendPreview(buyer.id);
  const intro = useEmailIntro(buyer.id);
  const failure = useAiFailure();
  const ai = useBuyerText().ai.intro;

  const buyerEmail = buyer.contact?.email ?? null;
  const agentEmail = buyer.assignedToUser?.email ?? null;
  const defaults = (): ('buyer' | 'agent')[] => {
    const to = buyer.wishlist?.sendMatchesTo ?? 'buyer';
    const wanted: ('buyer' | 'agent')[] = to === 'both' ? ['buyer', 'agent'] : [to];
    return wanted.filter((r) => (r === 'buyer' ? buyerEmail : agentEmail));
  };
  const languages = langs.data?.length ? langs.data : ['en'];
  const defaultLang = () => {
    const l = buyer.language?.slice(0, 2).toLowerCase();
    return l && languages.includes(l) ? l : l || languages[0];
  };

  const [recipients, setRecipients] = useState<('buyer' | 'agent')[]>(defaults);
  const [lang, setLang] = useState(defaultLang);
  const [message, setMessage] = useState('');
  const [shownMessage, setShownMessage] = useState('');
  const [allowResend, setAllowResend] = useState(false);

  useEffect(() => {
    if (!open) return;
    setRecipients(defaults());
    setLang(defaultLang());
    setMessage('');
    setShownMessage('');
    setAllowResend(false);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  const body = { propertyIds, recipients: recipients.length ? recipients : (['buyer'] as ('buyer' | 'agent')[]), lang, message: shownMessage || undefined, allowResend };
  const previewKey = JSON.stringify({ propertyIds, lang, shownMessage, allowResend });
  const skipped = preview.data?.skipped ?? [];
  const allSkipped = !allowResend && !!preview.data?.allSkipped;
  useEffect(() => {
    if (open && propertyIds.length) preview.mutate(body);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, previewKey]);

  const toggle = (r: 'buyer' | 'agent') => setRecipients((rs) => (rs.includes(r) ? rs.filter((x) => x !== r) : [...rs, r]));
  const noPattern = settings.data && !Object.keys(settings.data.propertyUrlPatterns ?? {}).length;

  const submit = async () => {
    if (!recipients.length) {
      toast({ title: t.pickRecipient, variant: 'destructive' });
      return;
    }
    try {
      const res = await send.mutateAsync({ ...body, message: message.trim() || undefined });
      toast({
        title: t.sent(res.results.filter((r) => r.ok).length),
        description: res.skipped?.length ? t.skippedSent(res.skipped.length) : undefined,
      });
      onOpenChange(false);
      onSent?.();
    } catch (err) {
      toast({ title: t.failed, description: (err as Error).message, variant: 'destructive' });
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[92vh] max-w-3xl overflow-y-auto" data-testid="send-dialog">
        <DialogHeader>
          <DialogTitle>{t.title(propertyIds.length)}</DialogTitle>
          <DialogDescription>{t.description}</DialogDescription>
        </DialogHeader>

        <div className="grid gap-4 sm:grid-cols-2">
          <div className="space-y-2">
            <Label>{t.to}</Label>
            <label className="flex items-center gap-2 text-sm">
              <Checkbox checked={recipients.includes('buyer')} disabled={!buyerEmail} onCheckedChange={() => toggle('buyer')} aria-label="buyer" />
              {buyerEmail ? t.buyer(buyerEmail) : <span className="text-muted-foreground">{t.noBuyerEmail}</span>}
            </label>
            <label className="flex items-center gap-2 text-sm">
              <Checkbox checked={recipients.includes('agent')} disabled={!agentEmail} onCheckedChange={() => toggle('agent')} aria-label="agent" />
              {agentEmail ? t.agent(agentEmail) : <span className="text-muted-foreground">{t.noAgent}</span>}
            </label>
          </div>
          <div className="space-y-2">
            <Label>{t.language}</Label>
            <FilterSelect
              className="w-full"
              value={lang}
              onChange={(v) => setLang(v || languages[0])}
              anyLabel={LANG_NAMES[languages[0]] ?? languages[0]}
              options={Array.from(new Set([...languages, lang])).map((l) => ({ value: l, label: LANG_NAMES[l] ?? l }))}
            />
          </div>
        </div>

        <div className="space-y-1.5">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <Label htmlFor="send-message">{t.message}</Label>
            {!buyer.erasedAt ? (
              <AiButton
                size="sm"
                variant="outline"
                className="h-8"
                pending={intro.isPending}
                title={ai.hint}
                data-testid="ai-intro"
                onClick={async () => {
                  try {
                    const out = await intro.mutateAsync({ propertyIds, lang });
                    setMessage(out.text);
                    setShownMessage(out.text);
                  } catch (err) {
                    failure.notify(err);
                  }
                }}
              >
                {message.trim() ? ai.again : ai.write}
              </AiButton>
            ) : null}
          </div>
          <Textarea id="send-message" rows={message.length > 160 ? 6 : 3} value={message} onChange={(e) => setMessage(e.target.value)} onBlur={() => setShownMessage(message.trim())} maxLength={5000} />
        </div>

        {noPattern ? (
          <p className="flex items-start gap-2 rounded-md border border-amber-300 bg-amber-50 p-3 text-sm text-amber-900 dark:bg-amber-950/30 dark:text-amber-200">
            <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
            {t.noUrlPattern}
          </p>
        ) : null}

        {skipped.length && !allowResend ? (
          <div className="space-y-2 rounded-md border border-amber-300 bg-amber-50 p-3 text-sm text-amber-900 dark:bg-amber-950/30 dark:text-amber-200" data-testid="send-skipped">
            <p className="flex items-start gap-2">
              <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
              {allSkipped ? t.allSkipped : t.skipped(skipped.map((s) => s.reference).join(', '))}
            </p>
            <label className="flex items-center gap-2">
              <Checkbox checked={allowResend} onCheckedChange={(v) => setAllowResend(!!v)} aria-label={t.includeSkipped} data-testid="send-allow-resend" />
              {t.includeSkipped}
            </label>
          </div>
        ) : allowResend ? (
          <label className="flex items-center gap-2 text-sm">
            <Checkbox checked={allowResend} onCheckedChange={(v) => setAllowResend(!!v)} aria-label={t.includeSkipped} />
            {t.includeSkipped}
          </label>
        ) : null}

        <div className="space-y-1.5">
          <Label>{t.preview}</Label>
          {preview.data ? <p className="text-sm font-medium" data-testid="preview-subject">{preview.data.subject}</p> : null}
          <div className="h-[380px] overflow-hidden rounded-md border bg-muted/30">
            {preview.isPending && !preview.data ? (
              <div className="flex h-full items-center justify-center"><Loader2 className="h-5 w-5 animate-spin text-muted-foreground" /></div>
            ) : preview.isError ? (
              <p className="p-4 text-sm text-destructive">{t.previewFailed}</p>
            ) : preview.data ? (
              <iframe title={t.preview} sandbox="" srcDoc={preview.data.html} className="h-full w-full bg-white" data-testid="preview-frame" />
            ) : null}
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>{t.cancel}</Button>
          <Button onClick={submit} disabled={send.isPending || !recipients.length || allSkipped} data-testid="send-submit">
            {send.isPending ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
            {send.isPending ? t.sending : t.send}
          </Button>
        </DialogFooter>
        {failure.dialog}
      </DialogContent>
    </Dialog>
  );
}
