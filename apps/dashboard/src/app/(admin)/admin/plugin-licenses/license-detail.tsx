'use client';

import { useEffect, useState } from 'react';
import { Ban, CalendarPlus, Globe, KeyRound, RefreshCw, RotateCcw, Save, Trash2 } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription,
  AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import { useApi } from '@/hooks/use-api';
import { useToast } from '@/hooks/use-toast';
import { KeyReveal } from './key-reveal';
import { LicenseDetail, PluginPlan, daysUntil, unwrap } from './types';
import { StatusBadge } from './status-badge';

const day = (iso: string | null) => (iso ? new Date(iso).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' }) : '—');
const when = (iso: string | null) => (iso ? new Date(iso).toLocaleString('en-GB', { day: 'numeric', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' }) : 'never');

type Confirm = { kind: 'revoke' | 'replace' | 'site'; siteId?: number; siteUrl?: string } | null;

export function LicenseDetailDialog({ licenseId, plans, onClose, onChanged }: {
  licenseId: number | null;
  plans: PluginPlan[];
  onClose: () => void;
  onChanged: () => void;
}) {
  const api = useApi();
  const { toast } = useToast();
  const [detail, setDetail] = useState<LicenseDetail | null>(null);
  const [busy, setBusy] = useState(false);
  const [confirm, setConfirm] = useState<Confirm>(null);
  const [newKey, setNewKey] = useState<{ key: string; emailed: boolean } | null>(null);
  const [form, setForm] = useState({ plan: '', sitesAllowed: '', expiresAt: '', email: '', customerName: '', notes: '' });

  const load = (d: LicenseDetail) => {
    setDetail(d);
    const l = d.license;
    setForm({ plan: l.plan, sitesAllowed: String(l.sitesAllowed), expiresAt: l.expiresAt ? l.expiresAt.slice(0, 10) : '', email: l.email, customerName: l.customerName ?? '', notes: l.notes ?? '' });
  };

  useEffect(() => {
    setDetail(null);
    setNewKey(null);
    if (licenseId === null || !api.isReady) return;
    api.get(`/api/super-admin/plugin-licenses/${licenseId}`).then((r) => load(unwrap<LicenseDetail>(r))).catch((e) => toast({ title: 'Could not load the licence', description: e.message, variant: 'destructive' }));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [licenseId, api.isReady]);

  const act = async (label: string, call: () => Promise<any>) => {
    setBusy(true);
    try {
      const d = unwrap<LicenseDetail>(await call());
      load(d);
      if (d.key) setNewKey({ key: d.key, emailed: !!d.emailed });
      onChanged();
      toast({ title: label });
    } catch (e: any) {
      toast({ title: 'Something went wrong', description: e.message || 'Request failed', variant: 'destructive' });
    } finally {
      setBusy(false);
      setConfirm(null);
    }
  };

  const base = `/api/super-admin/plugin-licenses/${licenseId}`;
  const l = detail?.license;

  const save = () => {
    if (!l) return;
    const body: Record<string, unknown> = {};
    if (form.plan !== l.plan) body.plan = form.plan;
    else if (form.sitesAllowed && parseInt(form.sitesAllowed, 10) !== l.sitesAllowed) body.sitesAllowed = parseInt(form.sitesAllowed, 10);
    if (form.expiresAt && form.expiresAt !== (l.expiresAt ?? '').slice(0, 10)) body.expiresAt = new Date(`${form.expiresAt}T23:59:59Z`).toISOString();
    if (form.email.trim() !== l.email) body.email = form.email.trim();
    if (form.customerName.trim() !== (l.customerName ?? '')) body.customerName = form.customerName.trim() || null;
    if (form.notes.trim() !== (l.notes ?? '')) body.notes = form.notes.trim() || null;
    if (!Object.keys(body).length) return;
    act('Licence saved', () => api.patch(base, body));
  };

  const left = l ? daysUntil(l.expiresAt) : null;

  return (
    <Dialog open={licenseId !== null} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-3xl max-h-[90vh] overflow-y-auto">
        {!l ? (
          <div className="flex h-40 items-center justify-center"><RefreshCw className="h-6 w-6 animate-spin text-muted-foreground" /></div>
        ) : (
          <div className="space-y-6">
            <DialogHeader>
              <DialogTitle className="flex flex-wrap items-center gap-2">
                {l.customerName || l.email} <StatusBadge status={l.status} />
                {l.source === 'stripe' && <Badge variant="outline">Stripe</Badge>}
              </DialogTitle>
              <DialogDescription>
                {l.planLabel} · key ending <span className="font-mono">{l.last4}</span> · issued {day(l.createdAt)}
              </DialogDescription>
            </DialogHeader>

            {newKey && <KeyReveal licenseKey={newKey.key} email={l.email} emailed={newKey.emailed} />}

            <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
              <Stat label="Expires" value={day(l.expiresAt)} hint={left === null ? '' : left >= 0 ? `in ${left} days` : `${-left} days ago`} />
              <Stat label="Sites" value={`${l.sitesUsed} of ${l.sitesAllowed}`} hint={l.lastSeenAt ? `last check ${when(l.lastSeenAt)}` : 'not activated yet'} />
              <Stat label="AI" value={l.credits ? 'SPM credits' : 'Own API key'} hint={l.credits ? `${l.credits.words_used.toLocaleString('en-GB')} / ${l.credits.words_allowed.toLocaleString('en-GB')} words` : ''} />
              <Stat label="Source" value={l.source === 'stripe' ? 'Stripe' : 'Issued by admin'} hint="" />
            </div>

            <div className="flex flex-wrap gap-2">
              <Button size="sm" variant="outline" disabled={busy} onClick={() => act('Extended by 1 month', () => api.post(`${base}/extend`, { months: 1 }))}>
                <CalendarPlus className="mr-1.5 h-4 w-4" />+1 month
              </Button>
              <Button size="sm" variant="outline" disabled={busy} onClick={() => act('Extended by 1 year', () => api.post(`${base}/extend`, { months: 12 }))}>
                <CalendarPlus className="mr-1.5 h-4 w-4" />+1 year
              </Button>
              <Button size="sm" variant="outline" disabled={busy} onClick={() => setConfirm({ kind: 'replace' })}>
                <KeyRound className="mr-1.5 h-4 w-4" />Replace key
              </Button>
              {l.status === 'revoked' ? (
                <Button size="sm" variant="outline" disabled={busy} onClick={() => act('Licence restored', () => api.post(`${base}/restore`, {}))}>
                  <RotateCcw className="mr-1.5 h-4 w-4" />Restore
                </Button>
              ) : (
                <Button size="sm" variant="outline" className="text-destructive" disabled={busy} onClick={() => setConfirm({ kind: 'revoke' })}>
                  <Ban className="mr-1.5 h-4 w-4" />Revoke
                </Button>
              )}
            </div>

            <section className="space-y-2">
              <h3 className="text-sm font-semibold">Activated sites</h3>
              {detail.sites.length === 0 ? (
                <p className="text-sm text-muted-foreground">No site has activated this key yet.</p>
              ) : (
                <ul className="divide-y rounded-md border">
                  {detail.sites.map((s) => (
                    <li key={s.id} className="flex items-center justify-between gap-3 px-3 py-2 text-sm">
                      <div className="min-w-0">
                        <p className="flex items-center gap-1.5 font-medium"><Globe className="h-3.5 w-3.5 text-muted-foreground" /><span className="truncate">{s.siteUrl}</span></p>
                        <p className="text-xs text-muted-foreground">plugin {s.pluginVersion ?? '?'} · activated {day(s.activatedAt)} · last check {when(s.lastSeenAt)}</p>
                      </div>
                      <Button size="sm" variant="ghost" disabled={busy} onClick={() => setConfirm({ kind: 'site', siteId: s.id, siteUrl: s.siteUrl })} aria-label={`Free ${s.siteUrl}`}>
                        <Trash2 className="h-4 w-4" />
                      </Button>
                    </li>
                  ))}
                </ul>
              )}
            </section>

            <section className="space-y-3">
              <h3 className="text-sm font-semibold">Edit</h3>
              <div className="grid gap-3 sm:grid-cols-3">
                <div className="space-y-1.5">
                  <Label htmlFor="ld-plan">Plan</Label>
                  <Select value={form.plan} onValueChange={(v) => setForm({ ...form, plan: v, sitesAllowed: String(plans.find((p) => p.id === v)?.sites ?? form.sitesAllowed) })}>
                    <SelectTrigger id="ld-plan"><SelectValue /></SelectTrigger>
                    <SelectContent>{plans.map((p) => <SelectItem key={p.id} value={p.id}>{p.label}</SelectItem>)}</SelectContent>
                  </Select>
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="ld-sites">Sites allowed</Label>
                  <Input id="ld-sites" type="number" min={1} max={1000} value={form.sitesAllowed} disabled={form.plan !== l.plan} onChange={(e) => setForm({ ...form, sitesAllowed: e.target.value })} />
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="ld-exp">Expiry date</Label>
                  <Input id="ld-exp" type="date" value={form.expiresAt} onChange={(e) => setForm({ ...form, expiresAt: e.target.value })} />
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="ld-email">Client email</Label>
                  <Input id="ld-email" type="email" value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} />
                </div>
                <div className="space-y-1.5 sm:col-span-2">
                  <Label htmlFor="ld-name">Client name</Label>
                  <Input id="ld-name" value={form.customerName} onChange={(e) => setForm({ ...form, customerName: e.target.value })} />
                </div>
                <div className="space-y-1.5 sm:col-span-3">
                  <Label htmlFor="ld-notes">Note</Label>
                  <Textarea id="ld-notes" rows={2} maxLength={500} value={form.notes} onChange={(e) => setForm({ ...form, notes: e.target.value })} />
                </div>
              </div>
              <Button size="sm" disabled={busy} onClick={save}><Save className="mr-1.5 h-4 w-4" />Save changes</Button>
            </section>

            <section className="space-y-2">
              <h3 className="text-sm font-semibold">History</h3>
              {detail.history.length === 0 ? (
                <p className="text-sm text-muted-foreground">No changes recorded.</p>
              ) : (
                <ul className="space-y-1 text-sm">
                  {detail.history.map((h) => (
                    <li key={h.id} className="flex flex-wrap gap-x-2 text-muted-foreground">
                      <span className="text-foreground capitalize">{h.event}</span>
                      <span>{when(h.createdAt)}</span>
                      {h.by && <span>by {h.by}</span>}
                    </li>
                  ))}
                </ul>
              )}
            </section>
          </div>
        )}

        <AlertDialog open={confirm !== null} onOpenChange={(o) => !o && setConfirm(null)}>
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle>
                {confirm?.kind === 'revoke' ? 'Revoke this licence?' : confirm?.kind === 'replace' ? 'Replace the licence key?' : `Free ${confirm?.siteUrl}?`}
              </AlertDialogTitle>
              <AlertDialogDescription>
                {confirm?.kind === 'revoke' && 'Translating stops on every site at the next check (within a day). Existing translations stay. You can restore it later.'}
                {confirm?.kind === 'replace' && 'The old key stops working right away. Sites must enter the new key; they keep their slots. The new key is emailed to the client and shown here once.'}
                {confirm?.kind === 'site' && 'The site slot becomes free, for example when the client moves to a new website. That site stops translating at its next check.'}
              </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel>Cancel</AlertDialogCancel>
              <AlertDialogAction
                onClick={() => {
                  if (confirm?.kind === 'revoke') act('Licence revoked', () => api.post(`${base}/revoke`, {}));
                  if (confirm?.kind === 'replace') act('New key issued', () => api.post(`${base}/regenerate-key`, { sendEmail: true }));
                  if (confirm?.kind === 'site') act('Site freed', () => api.delete(`${base}/sites/${confirm.siteId}`));
                }}
              >
                {confirm?.kind === 'revoke' ? 'Revoke' : confirm?.kind === 'replace' ? 'Replace and email' : 'Free site'}
              </AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>
      </DialogContent>
    </Dialog>
  );
}

function Stat({ label, value, hint }: { label: string; value: string; hint: string }) {
  return (
    <div className="rounded-md border p-3">
      <p className="text-[11px] uppercase tracking-wide text-muted-foreground">{label}</p>
      <p className="mt-0.5 font-semibold">{value}</p>
      {hint && <p className="text-xs text-muted-foreground">{hint}</p>}
    </div>
  );
}
