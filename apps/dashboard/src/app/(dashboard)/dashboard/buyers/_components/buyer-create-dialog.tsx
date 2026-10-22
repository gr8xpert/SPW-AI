'use client';

import { useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useSession } from 'next-auth/react';
import { Loader2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { useToast } from '@/hooks/use-toast';
import { useBuyerText } from '../_i18n/use-buyer-text';
import { BUYER_ROLES, useCreateBuyer, type BuyerAgent, type BuyerRole } from '../use-buyers';
import { FilterSelect } from './filter-select';

const EMPTY = { firstName: '', lastName: '', email: '', phone: '', role: 'buyer' as BuyerRole, assignedTo: '' };

export function BuyerCreateDialog({
  open,
  onOpenChange,
  agents,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  agents: BuyerAgent[];
}) {
  const t = useBuyerText();
  const router = useRouter();
  const { toast } = useToast();
  const { data: session } = useSession();
  const create = useCreateBuyer();
  const [form, setForm] = useState(EMPTY);
  const [existingId, setExistingId] = useState<number | null>(null);

  // Default agent = me, when I am one of the tenant's agents.
  const me = agents.find((a) => a.email === session?.user?.email);

  const reset = (next: boolean) => {
    if (next) {
      setForm({ ...EMPTY, assignedTo: me ? String(me.id) : '' });
      setExistingId(null);
    }
    onOpenChange(next);
  };

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setExistingId(null);
    try {
      const buyer = await create.mutateAsync({
        email: form.email.trim(),
        firstName: form.firstName.trim() || undefined,
        lastName: form.lastName.trim() || undefined,
        phone: form.phone.trim() || undefined,
        role: form.role,
        assignedTo: form.assignedTo ? Number(form.assignedTo) : undefined,
      });
      toast({ title: t.create.created });
      onOpenChange(false);
      if (buyer?.id) router.push(`/dashboard/buyers/${buyer.id}`);
    } catch (err) {
      const e2 = err as { code?: string; details?: { id?: number }; message?: string };
      if (e2.code === 'BUYER_EXISTS' && e2.details?.id) {
        setExistingId(e2.details.id);
        return;
      }
      toast({ title: t.create.failed, description: e2.message, variant: 'destructive' });
    }
  };

  const set = (key: keyof typeof EMPTY) => (e: React.ChangeEvent<HTMLInputElement>) =>
    setForm((f) => ({ ...f, [key]: e.target.value }));

  return (
    <Dialog open={open} onOpenChange={reset}>
      <DialogContent className="sm:max-w-md">
        <form onSubmit={submit}>
          <DialogHeader>
            <DialogTitle>{t.create.title}</DialogTitle>
            <DialogDescription>{t.create.description}</DialogDescription>
          </DialogHeader>
          <div className="grid gap-4 py-4">
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label htmlFor="nb-first">{t.create.firstName}</Label>
                <Input id="nb-first" value={form.firstName} onChange={set('firstName')} maxLength={100} />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="nb-last">{t.create.lastName}</Label>
                <Input id="nb-last" value={form.lastName} onChange={set('lastName')} maxLength={100} />
              </div>
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="nb-email">{t.create.email} *</Label>
              <Input id="nb-email" type="email" required value={form.email} onChange={set('email')} />
              {existingId ? (
                <p className="text-sm text-amber-700">
                  {t.create.exists}{' '}
                  <Link className="font-medium underline" href={`/dashboard/buyers/${existingId}`} onClick={() => onOpenChange(false)}>
                    {t.create.open}
                  </Link>
                </p>
              ) : null}
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="nb-phone">{t.create.phone}</Label>
              <Input id="nb-phone" value={form.phone} onChange={set('phone')} maxLength={50} />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label>{t.create.role}</Label>
                <FilterSelect
                  className="w-full"
                  value={form.role === 'buyer' ? '' : form.role}
                  onChange={(v) => setForm((f) => ({ ...f, role: (v || 'buyer') as BuyerRole }))}
                  anyLabel={t.roles.buyer}
                  options={BUYER_ROLES.filter((r) => r !== 'buyer').map((r) => ({ value: r, label: t.roles[r] }))}
                />
              </div>
              <div className="space-y-1.5">
                <Label>{t.create.agent}</Label>
                <FilterSelect
                  className="w-full"
                  value={form.assignedTo}
                  onChange={(v) => setForm((f) => ({ ...f, assignedTo: v }))}
                  anyLabel={t.unassigned}
                  options={agents.map((a) => ({ value: String(a.id), label: a.name || a.email }))}
                />
              </div>
            </div>
          </div>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
              {t.create.cancel}
            </Button>
            <Button type="submit" disabled={create.isPending || !form.email.trim()}>
              {create.isPending ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
              {t.create.save}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
