'use client';

import { useEffect, useState } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Loader2 } from 'lucide-react';
import { useSession } from 'next-auth/react';
import { useCampaignsText } from '../../_i18n';
import { useCampaignsMoreText } from '../../_i18n/more';
import { CampaignFormFields, type CampaignFormValues, type TemplateOption } from '../../_components/campaign-form';

export function TestEmailDialog({
  open,
  onOpenChange,
  onSend,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSend: (email: string) => Promise<boolean>;
}) {
  const t = useCampaignsText();
  const m = useCampaignsMoreText();
  const { data: session } = useSession();
  const [email, setEmail] = useState('');
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (open && !email && session?.user?.email) setEmail(session.user.email);
  }, [open, session?.user?.email]); // eslint-disable-line react-hooks/exhaustive-deps

  const valid = /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim());
  const send = async () => {
    setBusy(true);
    const ok = await onSend(email.trim());
    setBusy(false);
    if (ok) onOpenChange(false);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{m.testTitle}</DialogTitle>
          <DialogDescription>{m.testText}</DialogDescription>
        </DialogHeader>
        <div className="space-y-2 py-2">
          <Label htmlFor="test-email">{m.testEmailLabel}</Label>
          <Input id="test-email" type="email" value={email} onChange={(e) => setEmail(e.target.value)} />
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>{t.common.cancel}</Button>
          <Button onClick={send} disabled={!valid || busy}>
            {busy && <Loader2 className="h-4 w-4 animate-spin mr-2" />}
            {m.sendTest}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// datetime-local wants "YYYY-MM-DDTHH:mm" in local time.
function localInputValue(d: Date): string {
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

export function ScheduleDialog({
  open,
  onOpenChange,
  onSchedule,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSchedule: (when: Date) => Promise<boolean>;
}) {
  const t = useCampaignsText();
  const m = useCampaignsMoreText();
  const [value, setValue] = useState('');
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!open) return;
    const next = new Date(Date.now() + 60 * 60 * 1000);
    next.setMinutes(0, 0, 0);
    setValue(localInputValue(next));
  }, [open]);

  const when = value ? new Date(value) : null;
  const valid = !!when && !Number.isNaN(when.getTime()) && when.getTime() > Date.now() + 60_000;

  const save = async () => {
    if (!when) return;
    setBusy(true);
    const ok = await onSchedule(when);
    setBusy(false);
    if (ok) onOpenChange(false);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{m.scheduleTitle}</DialogTitle>
          <DialogDescription>{m.scheduleText}</DialogDescription>
        </DialogHeader>
        <div className="space-y-2 py-2">
          <Label htmlFor="schedule-at">{m.scheduleLabel}</Label>
          <Input
            id="schedule-at"
            type="datetime-local"
            min={localInputValue(new Date(Date.now() + 2 * 60_000))}
            value={value}
            onChange={(e) => setValue(e.target.value)}
          />
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>{t.common.cancel}</Button>
          <Button onClick={save} disabled={!valid || busy}>
            {busy && <Loader2 className="h-4 w-4 animate-spin mr-2" />}
            {t.detail.schedule}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

export function EditCampaignDialog({
  open,
  onOpenChange,
  initial,
  templates,
  onSave,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  initial: CampaignFormValues;
  templates: TemplateOption[];
  onSave: (values: CampaignFormValues) => Promise<boolean>;
}) {
  const t = useCampaignsText();
  const m = useCampaignsMoreText();
  const [values, setValues] = useState(initial);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (open) setValues(initial);
  }, [open]); // eslint-disable-line react-hooks/exhaustive-deps

  const save = async () => {
    setBusy(true);
    const ok = await onSave(values);
    setBusy(false);
    if (ok) onOpenChange(false);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{m.editTitle}</DialogTitle>
          <DialogDescription>{m.editDescription}</DialogDescription>
        </DialogHeader>
        <div className="py-2">
          <CampaignFormFields values={values} onChange={setValues} templates={templates} t={t} enabled={open} />
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>{t.common.cancel}</Button>
          <Button onClick={save} disabled={!values.name.trim() || !values.templateId || busy}>
            {busy && <Loader2 className="h-4 w-4 animate-spin mr-2" />}
            {m.save}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
