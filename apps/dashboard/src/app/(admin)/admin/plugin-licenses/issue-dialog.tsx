'use client';

import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { Textarea } from '@/components/ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { useApi } from '@/hooks/use-api';
import { useToast } from '@/hooks/use-toast';
import { KeyReveal } from './key-reveal';
import { LicenseRow, PluginPlan, unwrap } from './types';

const EMPTY = { plan: 'pro_single', email: '', customerName: '', months: '12', sitesAllowed: '', notes: '', sendEmail: true };

// Issue a key after confirming the client's payment on realtysoft.eu.
export function IssueDialog({ open, onOpenChange, plans, onIssued }: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  plans: PluginPlan[];
  onIssued: () => void;
}) {
  const api = useApi();
  const { toast } = useToast();
  const [form, setForm] = useState(EMPTY);
  const [saving, setSaving] = useState(false);
  const [issued, setIssued] = useState<{ key: string; license: LicenseRow; emailed: boolean } | null>(null);

  const plan = plans.find((p) => p.id === form.plan);
  const emailValid = /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(form.email.trim());
  const months = parseInt(form.months, 10);

  const close = (next: boolean) => {
    if (!next) {
      setForm(EMPTY);
      setIssued(null);
    }
    onOpenChange(next);
  };

  const submit = async () => {
    setSaving(true);
    try {
      const res = unwrap<{ key: string; license: LicenseRow; emailed: boolean }>(
        await api.post('/api/super-admin/plugin-licenses', {
          plan: form.plan,
          email: form.email.trim(),
          customerName: form.customerName.trim() || undefined,
          months,
          sitesAllowed: form.sitesAllowed ? parseInt(form.sitesAllowed, 10) : undefined,
          notes: form.notes.trim() || undefined,
          sendEmail: form.sendEmail,
        }),
      );
      setIssued(res);
      onIssued();
      if (form.sendEmail && !res.emailed) {
        toast({ title: 'Key issued, email not sent', description: 'Copy the key and send it to the client yourself.', variant: 'destructive' });
      }
    } catch (error: any) {
      toast({ title: 'Could not issue the key', description: error.message || 'Request failed', variant: 'destructive' });
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={close}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>{issued ? 'Licence issued' : 'Issue licence key'}</DialogTitle>
          <DialogDescription>
            {issued
              ? `${issued.license.planLabel} for ${issued.license.email}, valid until ${new Date(issued.license.expiresAt ?? '').toLocaleDateString('en-GB')}.`
              : 'Confirm the payment on realtysoft.eu first. The key works as soon as it is issued.'}
          </DialogDescription>
        </DialogHeader>

        {issued ? (
          <>
            <KeyReveal licenseKey={issued.key} email={issued.license.email} emailed={issued.emailed} />
            <DialogFooter>
              <Button onClick={() => close(false)}>Done</Button>
            </DialogFooter>
          </>
        ) : (
          <div className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="pl-plan">Plan</Label>
              <Select value={form.plan} onValueChange={(v) => setForm({ ...form, plan: v })}>
                <SelectTrigger id="pl-plan"><SelectValue /></SelectTrigger>
                <SelectContent>
                  {plans.map((p) => (
                    <SelectItem key={p.id} value={p.id}>
                      {p.label} · {p.sites} {p.sites === 1 ? 'site' : 'sites'}{p.words ? ` · ${p.words.toLocaleString('en-GB')} words/month` : ''}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label htmlFor="pl-email">Client email</Label>
                <Input id="pl-email" type="email" value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} placeholder="client@agency.com" />
              </div>
              <div className="space-y-2">
                <Label htmlFor="pl-name">Client name (optional)</Label>
                <Input id="pl-name" value={form.customerName} onChange={(e) => setForm({ ...form, customerName: e.target.value })} placeholder="Costa Homes" />
              </div>
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label htmlFor="pl-months">Paid period (months)</Label>
                <Input id="pl-months" type="number" min={1} max={36} value={form.months} onChange={(e) => setForm({ ...form, months: e.target.value })} />
              </div>
              <div className="space-y-2">
                <Label htmlFor="pl-sites">Sites (optional)</Label>
                <Input id="pl-sites" type="number" min={1} max={1000} value={form.sitesAllowed} onChange={(e) => setForm({ ...form, sitesAllowed: e.target.value })} placeholder={plan ? `${plan.sites} (plan default)` : ''} />
              </div>
            </div>

            <div className="space-y-2">
              <Label htmlFor="pl-notes">Note (optional)</Label>
              <Textarea id="pl-notes" rows={2} maxLength={500} value={form.notes} onChange={(e) => setForm({ ...form, notes: e.target.value })} placeholder="Order or invoice number, payment date…" />
            </div>

            <div className="flex items-center gap-2">
              <Switch id="pl-send" checked={form.sendEmail} onCheckedChange={(v) => setForm({ ...form, sendEmail: v })} />
              <Label htmlFor="pl-send">Email the key and install steps to the client</Label>
            </div>

            <DialogFooter>
              <Button type="button" variant="outline" onClick={() => close(false)}>Cancel</Button>
              <Button onClick={submit} disabled={saving || !emailValid || !(months >= 1 && months <= 36)}>
                {saving ? 'Issuing…' : 'Issue key'}
              </Button>
            </DialogFooter>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
