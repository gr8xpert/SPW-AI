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

const EMAIL_RE = /^[^@\s]+@[^@\s]+\.[^@\s]+$/;

// Settings → Email: the Monday summary email (views, enquiries, feed, what
// needs attention). On by default; empty recipient list = the account's admins.
export function WeeklyReportCard() {
  const { data: session } = useSession();
  const { toast } = useToast();
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
      toast({ title: 'That is not an email address', variant: 'destructive' });
      return;
    }
    if (!emails.includes(e)) setEmails([...emails, e].slice(0, 10));
    setInput('');
  };

  const save = async () => {
    setSaving(true);
    try {
      await apiPut('/api/dashboard/tenant/settings', { weeklyReportEnabled: enabled, weeklyReportEmails: emails });
      toast({ title: 'Weekly report settings saved' });
    } catch (err) {
      toast({ title: 'Could not save', description: (err as Error).message, variant: 'destructive' });
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
      toast({ title: 'Could not build the preview', description: (err as Error).message, variant: 'destructive' });
    } finally {
      setLoadingPreview(false);
    }
  };

  const sendToMe = async () => {
    setSending(true);
    try {
      const res = await apiPost<{ data: { sentTo: string } }>('/api/dashboard/website-health/weekly-report/send-to-me');
      toast({ title: 'Report sent', description: `Check ${res.data?.sentTo ?? 'your inbox'}.` });
    } catch (err) {
      toast({ title: 'Could not send', description: (err as Error).message, variant: 'destructive' });
    } finally {
      setSending(false);
    }
  };

  return (
    <Card className="mt-4">
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <CalendarClock className="h-5 w-5" /> Weekly report
        </CardTitle>
        <CardDescription>
          Every Monday morning: last week&apos;s property views, searches and enquiries, the most viewed properties, what your
          feed imported, and anything on your website that needs attention.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="flex items-center gap-3">
          <Switch id="weekly-report-enabled" checked={enabled} onCheckedChange={setEnabled} />
          <Label htmlFor="weekly-report-enabled">Send the weekly report</Label>
        </div>
        <div className="space-y-2">
          <Label>Send it to</Label>
          <div className="flex flex-wrap gap-2">
            {emails.map((e) => (
              <span key={e} className="inline-flex items-center gap-1 rounded-full bg-muted px-3 py-1 text-sm">
                {e}
                <button type="button" aria-label={`Remove ${e}`} onClick={() => setEmails(emails.filter((x) => x !== e))}>
                  <X className="h-3 w-3" />
                </button>
              </span>
            ))}
            {!emails.length && <span className="text-sm text-muted-foreground">Your account&apos;s admins (add addresses to choose yourself)</span>}
          </div>
          <div className="flex max-w-md gap-2">
            <Input
              type="email"
              placeholder="name@agency.com"
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
              <Plus className="mr-1 h-4 w-4" /> Add
            </Button>
          </div>
        </div>
        <div className="flex flex-wrap gap-2">
          <Button onClick={save} disabled={saving} size="sm">
            {saving ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
            Save
          </Button>
          <Button onClick={openPreview} disabled={loadingPreview} size="sm" variant="outline">
            {loadingPreview ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Eye className="mr-2 h-4 w-4" />}
            Preview this week&apos;s report
          </Button>
          <Button onClick={sendToMe} disabled={sending} size="sm" variant="outline">
            {sending ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Send className="mr-2 h-4 w-4" />}
            Send it to me now
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
              <p className="text-sm text-muted-foreground">To: {preview.recipients.join(', ') || 'nobody yet — add an address'}</p>
              {/* sandboxed: the email HTML is ours, but it holds listing titles from feeds */}
              <iframe title="Weekly report preview" srcDoc={preview.html} sandbox="" className="h-[70vh] w-full rounded border" />
            </>
          )}
        </DialogContent>
      </Dialog>
    </Card>
  );
}
