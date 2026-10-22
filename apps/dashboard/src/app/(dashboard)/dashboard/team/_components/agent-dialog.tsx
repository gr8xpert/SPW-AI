'use client';

import { useEffect, useState } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { PhotoUpload } from '@/components/photo-upload';
import { useToast } from '@/hooks/use-toast';
import { initialsOf, useCreateAgent, useUpdateAgent, type Agent, type AgentAccess, type AgentInput } from '@/hooks/use-agents';
import { useTeamText } from '../_i18n';

interface FormState {
  name: string;
  title: string;
  phone: string;
  whatsapp: string;
  publicEmail: string;
  avatarUrl: string;
  access: AgentAccess;
  email: string;
  password: string;
  worksBuyers: boolean;
  showOnWebsite: boolean;
  isActive: boolean;
}

const EMPTY: FormState = {
  name: '', title: '', phone: '', whatsapp: '', publicEmail: '', avatarUrl: '',
  access: 'agent', email: '', password: '', worksBuyers: true, showOnWebsite: false, isActive: true,
};

const fromAgent = (a: Agent): FormState => ({
  name: a.name ?? '', title: a.title ?? '', phone: a.phone ?? '', whatsapp: a.whatsapp ?? '',
  publicEmail: a.publicEmail ?? '', avatarUrl: a.avatarUrl ?? '', access: a.access, email: a.email ?? '',
  password: '', worksBuyers: a.worksBuyers, showOnWebsite: a.showOnWebsite, isActive: a.isActive,
});

// Access levels in the order the picker shows them (labels in _i18n).
const ACCESS_ORDER: AgentAccess[] = ['manager', 'agent', 'none'];

// Card fields. Labels and the job-title/email examples come from _i18n; the
// phone examples are the same in every language.
const CARD_FIELDS: { key: 'title' | 'phone' | 'whatsapp' | 'publicEmail'; placeholder?: string; type?: string }[] = [
  { key: 'title' },
  { key: 'phone', placeholder: '+34 952 000 000' },
  { key: 'whatsapp', placeholder: '+34 600 000 000' },
  { key: 'publicEmail', type: 'email' },
];

// Add or edit a person on the Agents page. `agent` null = add.
export function AgentDialog({
  open,
  onOpenChange,
  agent,
  selfId,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  agent: Agent | null;
  selfId: number | null;
}) {
  const { toast } = useToast();
  const t = useTeamText();
  const create = useCreateAgent();
  const update = useUpdateAgent();
  const [form, setForm] = useState<FormState>(EMPTY);
  useEffect(() => {
    if (open) setForm(agent ? fromAgent(agent) : EMPTY);
  }, [open, agent]);

  const set = <K extends keyof FormState>(key: K, value: FormState[K]) => setForm((f) => ({ ...f, [key]: value }));
  const isSelf = !!agent && agent.id === selfId;
  const login = form.access !== 'none';
  // A login is new when adding one, or when the person had none.
  const newLogin = login && (!agent || !agent.canLogin);
  const saving = create.isPending || update.isPending;
  const canSave = form.name.trim() !== '' && (!newLogin || (form.email.trim() !== '' && form.password.length >= 8));

  const save = async () => {
    const input: AgentInput = {
      name: form.name.trim(),
      title: form.title,
      phone: form.phone,
      whatsapp: form.whatsapp,
      publicEmail: form.publicEmail,
      avatarUrl: form.avatarUrl,
      showOnWebsite: form.showOnWebsite,
      worksBuyers: login && form.worksBuyers,
    };
    if (!isSelf) input.access = form.access;
    if (agent && !isSelf) input.isActive = form.isActive;
    if (newLogin) {
      input.email = form.email.trim();
      input.password = form.password;
    } else if (agent?.canLogin && login && form.email.trim() && form.email.trim() !== agent.email) {
      input.email = form.email.trim();
    }
    try {
      if (agent) await update.mutateAsync({ id: agent.id, input });
      else await create.mutateAsync(input);
      toast({ title: agent ? t.agentSaved : t.agentAdded });
      onOpenChange(false);
    } catch (e) {
      toast({ title: t.saveFailed, description: (e as Error).message, variant: 'destructive' });
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[92vh] overflow-y-auto sm:max-w-2xl" data-testid="agent-dialog">
        <DialogHeader>
          <DialogTitle>{agent ? t.editAgent : t.addAgent}</DialogTitle>
          <DialogDescription>
            {t.dialogDescription}
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-5 py-2">
          <div className="flex flex-col gap-4 sm:flex-row">
            <PhotoUpload value={form.avatarUrl} onChange={(url) => set('avatarUrl', url)} initials={initialsOf(form.name)} />
            <div className="grid flex-1 gap-3 sm:grid-cols-2">
              <div className="space-y-1 sm:col-span-2">
                <Label htmlFor="agent-name">{t.name}</Label>
                <Input id="agent-name" value={form.name} onChange={(e) => set('name', e.target.value)} placeholder={t.namePlaceholder} />
              </div>
              {CARD_FIELDS.map((f) => (
                <div key={f.key} className="space-y-1">
                  <Label htmlFor={`agent-${f.key}`} className="font-normal">{t.fields[f.key].label}</Label>
                  <Input
                    id={`agent-${f.key}`}
                    type={f.type ?? 'text'}
                    value={form[f.key]}
                    placeholder={f.key === 'title' ? t.fields.title.placeholder : f.key === 'publicEmail' ? t.emailPlaceholder : f.placeholder}
                    onChange={(e) => set(f.key, e.target.value)}
                  />
                </div>
              ))}
            </div>
          </div>

          <div className="space-y-3 rounded-md border p-4">
            <p className="text-sm font-medium">{t.whereTheyAppear}</p>
            <label className="flex items-start justify-between gap-4">
              <span>
                <span className="block text-sm">{t.worksWithBuyers}</span>
                <span className="block text-xs text-muted-foreground">
                  {login ? t.worksWithBuyersHelp : t.needsLogin}
                </span>
              </span>
              <Switch
                checked={login && form.worksBuyers}
                disabled={!login}
                onCheckedChange={(v) => set('worksBuyers', v)}
                aria-label={t.worksWithBuyers}
              />
            </label>
            <label className="flex items-start justify-between gap-4">
              <span>
                <span className="block text-sm">{t.showOnWebsite}</span>
                <span className="block text-xs text-muted-foreground">
                  {t.showOnWebsiteHelp}
                </span>
              </span>
              <Switch checked={form.showOnWebsite} onCheckedChange={(v) => set('showOnWebsite', v)} aria-label={t.showOnWebsite} />
            </label>
          </div>

          <div className="space-y-3 rounded-md border p-4">
            <div className="space-y-1">
              <Label>{t.dashboardAccess}</Label>
              <Select value={form.access} onValueChange={(v) => set('access', v as AgentAccess)} disabled={isSelf}>
                <SelectTrigger aria-label={t.dashboardAccess}><SelectValue /></SelectTrigger>
                <SelectContent>
                  {ACCESS_ORDER.map((a) => (
                    <SelectItem key={a} value={a}>{t.access[a]}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <p className="text-xs text-muted-foreground">{isSelf ? t.ownAccess : t.accessHelp[form.access]}</p>
            </div>
            {login && (
              <div className="grid gap-3 sm:grid-cols-2">
                <div className="space-y-1">
                  <Label htmlFor="agent-email" className="font-normal">{t.loginEmail}{newLogin ? ' *' : ''}</Label>
                  <Input id="agent-email" type="email" value={form.email} onChange={(e) => set('email', e.target.value)} placeholder={t.emailPlaceholder} />
                </div>
                {newLogin && (
                  <div className="space-y-1">
                    <Label htmlFor="agent-password" className="font-normal">{t.password}</Label>
                    <Input id="agent-password" type="password" value={form.password} onChange={(e) => set('password', e.target.value)} placeholder={t.passwordPlaceholder} />
                  </div>
                )}
              </div>
            )}
            {agent && !isSelf && (
              <label className="flex items-center justify-between gap-4">
                <span className="text-sm">{t.active}</span>
                <Switch checked={form.isActive} onCheckedChange={(v) => set('isActive', v)} aria-label={t.active} />
              </label>
            )}
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>{t.cancel}</Button>
          <Button onClick={save} disabled={saving || !canSave}>{saving ? t.saving : agent ? t.save : t.addAgent}</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
