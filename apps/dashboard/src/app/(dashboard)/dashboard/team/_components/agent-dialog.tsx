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

export const ACCESS_LABELS: Record<AgentAccess, string> = { manager: 'Manager', agent: 'Agent', none: 'No login' };
const ACCESS_HELP: Record<AgentAccess, string> = {
  manager: 'Logs in to the dashboard and sees everything, including settings and every buyer.',
  agent: 'Logs in to the dashboard and works their own buyers.',
  none: 'Cannot log in. Only shown on the website (for example a receptionist). Does not take a seat.',
};

const CARD_FIELDS: { key: 'title' | 'phone' | 'whatsapp' | 'publicEmail'; label: string; placeholder: string; type?: string }[] = [
  { key: 'title', label: 'Job title', placeholder: 'Sales Agent' },
  { key: 'phone', label: 'Phone', placeholder: '+34 952 000 000' },
  { key: 'whatsapp', label: 'WhatsApp number', placeholder: '+34 600 000 000' },
  { key: 'publicEmail', label: 'Email shown on the website', placeholder: 'name@your-agency.com', type: 'email' },
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
      toast({ title: agent ? 'Agent saved' : 'Agent added' });
      onOpenChange(false);
    } catch (e) {
      toast({ title: 'Could not save', description: (e as Error).message, variant: 'destructive' });
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[92vh] overflow-y-auto sm:max-w-2xl" data-testid="agent-dialog">
        <DialogHeader>
          <DialogTitle>{agent ? 'Edit agent' : 'Add agent'}</DialogTitle>
          <DialogDescription>
            One list for your website and your buyers. Tick where this person appears.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-5 py-2">
          <div className="flex flex-col gap-4 sm:flex-row">
            <PhotoUpload value={form.avatarUrl} onChange={(url) => set('avatarUrl', url)} initials={initialsOf(form.name)} />
            <div className="grid flex-1 gap-3 sm:grid-cols-2">
              <div className="space-y-1 sm:col-span-2">
                <Label htmlFor="agent-name">Name *</Label>
                <Input id="agent-name" value={form.name} onChange={(e) => set('name', e.target.value)} placeholder="Full name" />
              </div>
              {CARD_FIELDS.map((f) => (
                <div key={f.key} className="space-y-1">
                  <Label htmlFor={`agent-${f.key}`} className="font-normal">{f.label}</Label>
                  <Input
                    id={`agent-${f.key}`}
                    type={f.type ?? 'text'}
                    value={form[f.key]}
                    placeholder={f.placeholder}
                    onChange={(e) => set(f.key, e.target.value)}
                  />
                </div>
              ))}
            </div>
          </div>

          <div className="space-y-3 rounded-md border p-4">
            <p className="text-sm font-medium">Where they appear</p>
            <label className="flex items-start justify-between gap-4">
              <span>
                <span className="block text-sm">Works with buyers</span>
                <span className="block text-xs text-muted-foreground">
                  {login
                    ? 'Can be given buyers and is in the website round-robin (Buyers → Settings).'
                    : 'Needs a dashboard login.'}
                </span>
              </span>
              <Switch
                checked={login && form.worksBuyers}
                disabled={!login}
                onCheckedChange={(v) => set('worksBuyers', v)}
                aria-label="Works with buyers"
              />
            </label>
            <label className="flex items-start justify-between gap-4">
              <span>
                <span className="block text-sm">Show on website</span>
                <span className="block text-xs text-muted-foreground">
                  Can be picked as a property&apos;s agent, and their card (photo, name, title, phone, WhatsApp, email) shows on that property page.
                </span>
              </span>
              <Switch checked={form.showOnWebsite} onCheckedChange={(v) => set('showOnWebsite', v)} aria-label="Show on website" />
            </label>
          </div>

          <div className="space-y-3 rounded-md border p-4">
            <div className="space-y-1">
              <Label>Dashboard access</Label>
              <Select value={form.access} onValueChange={(v) => set('access', v as AgentAccess)} disabled={isSelf}>
                <SelectTrigger aria-label="Dashboard access"><SelectValue /></SelectTrigger>
                <SelectContent>
                  {(Object.keys(ACCESS_LABELS) as AgentAccess[]).map((a) => (
                    <SelectItem key={a} value={a}>{ACCESS_LABELS[a]}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <p className="text-xs text-muted-foreground">{isSelf ? 'You cannot change your own access.' : ACCESS_HELP[form.access]}</p>
            </div>
            {login && (
              <div className="grid gap-3 sm:grid-cols-2">
                <div className="space-y-1">
                  <Label htmlFor="agent-email" className="font-normal">Login email{newLogin ? ' *' : ''}</Label>
                  <Input id="agent-email" type="email" value={form.email} onChange={(e) => set('email', e.target.value)} placeholder="name@your-agency.com" />
                </div>
                {newLogin && (
                  <div className="space-y-1">
                    <Label htmlFor="agent-password" className="font-normal">Password *</Label>
                    <Input id="agent-password" type="password" value={form.password} onChange={(e) => set('password', e.target.value)} placeholder="At least 8 characters" />
                  </div>
                )}
              </div>
            )}
            {agent && !isSelf && (
              <label className="flex items-center justify-between gap-4">
                <span className="text-sm">Active</span>
                <Switch checked={form.isActive} onCheckedChange={(v) => set('isActive', v)} aria-label="Active" />
              </label>
            )}
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>Cancel</Button>
          <Button onClick={save} disabled={saving || !canSave}>{saving ? 'Saving…' : agent ? 'Save' : 'Add agent'}</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
