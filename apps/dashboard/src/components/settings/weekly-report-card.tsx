'use client';

import { useEffect, useState } from 'react';
import { useSession } from 'next-auth/react';
import { CalendarClock, Eye, Loader2, Plus, Send, X } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { useToast } from '@/hooks/use-toast';
import { apiGet, apiPost, apiPut } from '@/lib/api';
import { useSharedText } from '@/i18n/shared';

const EMAIL_RE = /^[^@\s]+@[^@\s]+\.[^@\s]+$/;

// Settings → Email: the Monday summary email (views, enquiries, feed, what
// needs attention). On by default; empty recipient list = the account's admins.
export function WeeklyReportCard() {
  const { data: session } = useSession();
  const { toast } = useToast();
  const t = useSharedText().weeklyReport;
  const [enabled, setEnabled] = useState(true);
  const [emails, setEmails] = useState<string[]>([]);
  const [input, setInput] = useState('');
  const [saving, setSaving] = useState(false);
  const [sending, setSending] = useState(false);
  const [preview, setPreview] = useState<{ subject: string; html: string; recipients: string[] } | null>(null);
  const [loadingPreview, setLoadingPreview] = useState(false);

  useEffect(() => {
    if (!session?.accessToken) return;
    apiGet<{ data: { settings?: { weeklyReportEnabled?: boolean; weeklyReportEmails?: string[] } } }>('/api/dashboard/tenant')
      .then((res) => {
        const s = res.data?.settings;
        if (typeof s?.weeklyReportEnabled === 'boolean') setEnabled(s.weeklyReportEnabled);
        if (Array.isArray(s?.weeklyReportEmails)) setEmails(s.weeklyReportEmails);
      })
      .catch(() => {});
  }, [session?.accessToken]);

  const addEmail = () => {
    const e = input.trim().toLowerCase();
    if (!EMAIL_RE.test(e)) {
      toast({ title: t.notEmail, variant: 'destructive' });
      return;
    }
    if (!emails.includes(e)) setEmails([...emails, e].slice(0, 10));
    setInput('');
  };

  const save = async () => {
    setSaving(true);
    try {
      await apiPut('/api/dashboard/tenant/settings', { weeklyReportEnabled: enabled, weeklyReportEmails: emails });
      toast({ title: t.saved });
    } catch (err) {
      toast({ title: t.saveFailed, description: (err as Error).message, variant: 'destructive' });
    } finally {
      setSaving(false);
    }
  };

  const openPreview = async () => {
    setLoadingPreview(true);
    try {
      const res = await apiGet<{ data: { subject: string; html: string; recipients: string[] } }>('/api/dashboard/website-health/weekly-report');
      setPreview(res.data);
    } catch (err) {
      toast({ title: t.previewFailed, description: (err as Error).message, variant: 'destructive' });
    } finally {
      setLoadingPreview(false);
    }
  };

  const sendToMe = async () => {
    setSending(true);
    try {
      const res = await apiPost<{ data: { sentTo: string } }>('/api/dashboard/website-health/weekly-report/send-to-me');
      toast({ title: t.sent, description: t.sentText(res.data?.sentTo) });
    } catch (err) {
      toast({ title: t.sendFailed, description: (err as Error).message, variant: 'destructive' });
    } finally {
      setSending(false);
    }
  };

  return (
    <Card className="mt-4">
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <CalendarClock className="h-5 w-5" /> {t.title}
        </CardTitle>
        <CardDescription>{t.description}</CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="flex items-center gap-3">
          <Switch id="weekly-report-enabled" checked={enabled} onCheckedChange={setEnabled} />
          <Label htmlFor="weekly-report-enabled">{t.enabled}</Label>
        </div>
        <div className="space-y-2">
          <Label>{t.sendTo}</Label>
          <div className="flex flex-wrap gap-2">
            {emails.map((e) => (
              <span key={e} className="inline-flex items-center gap-1 rounded-full bg-muted px-3 py-1 text-sm">
                {e}
                <button type="button" aria-label={t.remove(e)} onClick={() => setEmails(emails.filter((x) => x !== e))}>
                  <X className="h-3 w-3" />
                </button>
              </span>
            ))}
            {!emails.length && <span className="text-sm text-muted-foreground">{t.defaultRecipients}</span>}
          </div>
          <div className="flex max-w-md gap-2">
            <Input
              type="email"
              placeholder={t.emailPlaceholder}
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter') {
                  e.preventDefault();
                  addEmail();
                }
              }}
            />
            <Button type="button" variant="outline" onClick={addEmail}>
              <Plus className="mr-1 h-4 w-4" /> {t.add}
            </Button>
          </div>
        </div>
        <div className="flex flex-wrap gap-2">
          <Button onClick={save} disabled={saving} size="sm">
            {saving ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
            {t.save}
          </Button>
          <Button onClick={openPreview} disabled={loadingPreview} size="sm" variant="outline">
            {loadingPreview ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Eye className="mr-2 h-4 w-4" />}
            {t.preview}
          </Button>
          <Button onClick={sendToMe} disabled={sending} size="sm" variant="outline">
            {sending ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Send className="mr-2 h-4 w-4" />}
            {t.sendToMe}
          </Button>
        </div>
      </CardContent>

      <Dialog open={!!preview} onOpenChange={(open) => !open && setPreview(null)}>
        <DialogContent className="max-w-3xl">
          <DialogHeader>
            <DialogTitle>{preview?.subject}</DialogTitle>
          </DialogHeader>
          {preview && (
            <>
              <p className="text-sm text-muted-foreground">{t.to(preview.recipients.join(', ') || t.nobody)}</p>
              {/* sandboxed: the email HTML is ours, but it holds listing titles from feeds */}
              <iframe title={t.frameTitle} srcDoc={preview.html} sandbox="" className="h-[70vh] w-full rounded border" />
            </>
          )}
        </DialogContent>
      </Dialog>
    </Card>
  );
}
