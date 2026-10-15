'use client';

import { useRef, useState } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { useToast } from '@/hooks/use-toast';
import { api } from '@/lib/api';

// The agent shown on property pages (design 02's side column, above the
// form). The client's own public details.
export interface SiteAgentForm {
  name: string;
  title: string;
  phone: string;
  whatsapp: string;
  email: string;
  photo: string;
}

export const EMPTY_SITE_AGENT: SiteAgentForm = { name: '', title: '', phone: '', whatsapp: '', email: '', photo: '' };

export function siteAgentFromSettings(value: unknown): SiteAgentForm {
  const v = (value && typeof value === 'object' ? value : {}) as Record<string, unknown>;
  const s = (k: keyof SiteAgentForm) => (typeof v[k] === 'string' ? (v[k] as string) : '');
  return { name: s('name'), title: s('title'), phone: s('phone'), whatsapp: s('whatsapp'), email: s('email'), photo: s('photo') };
}

export function siteAgentToSettings(form: SiteAgentForm) {
  return Object.fromEntries(Object.entries(form).map(([k, v]) => [k, v.trim()]));
}

const FIELDS: { key: Exclude<keyof SiteAgentForm, 'photo'>; label: string; placeholder: string }[] = [
  { key: 'name', label: 'Name', placeholder: 'Pia Arrieta' },
  { key: 'title', label: 'Job title', placeholder: 'Principal Partner' },
  { key: 'phone', label: 'Phone', placeholder: '+34 952 765 138' },
  { key: 'whatsapp', label: 'WhatsApp number', placeholder: '+34 600 000 000' },
  { key: 'email', label: 'Email', placeholder: 'info@your-agency.com' },
];

export function SiteAgentSettings({ value, onChange }: { value: SiteAgentForm; onChange: (v: SiteAgentForm) => void }) {
  const { toast } = useToast();
  const fileRef = useRef<HTMLInputElement>(null);
  const [uploading, setUploading] = useState(false);

  const upload = async (file: File) => {
    if (!file.type.startsWith('image/')) {
      toast({ title: 'Choose an image', description: 'The photo must be a JPG, PNG or WebP file.', variant: 'destructive' });
      return;
    }
    setUploading(true);
    try {
      const form = new FormData();
      form.append('file', file);
      const res = await api.post('/api/dashboard/upload', form);
      const data = (res?.data?.data ?? res?.data ?? res) as { url?: string };
      if (!data?.url) throw new Error('The upload returned no address.');
      onChange({ ...value, photo: data.url });
    } catch (e) {
      toast({ title: 'Photo upload failed', description: (e as Error).message, variant: 'destructive' });
    } finally {
      setUploading(false);
      if (fileRef.current) fileRef.current.value = '';
    }
  };

  return (
    <div className="space-y-4 rounded-md border p-4">
      <div className="space-y-1">
        <Label>Website agent</Label>
        <p className="text-xs text-muted-foreground">
          The contact shown on property pages (property page design 02: in the side column, above the contact
          form). Leave the name empty to show no agent.
        </p>
      </div>
      <div className="flex flex-col gap-4 sm:flex-row">
        <div className="flex flex-col items-center gap-2">
          <div className="h-24 w-24 overflow-hidden rounded-full border bg-muted">
            {value.photo && (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={value.photo} alt="" className="h-full w-full object-cover" />
            )}
          </div>
          <input ref={fileRef} type="file" accept="image/*" className="hidden" onChange={(e) => e.target.files?.[0] && upload(e.target.files[0])} />
          <Button type="button" variant="outline" size="sm" disabled={uploading} onClick={() => fileRef.current?.click()}>
            {uploading ? 'Uploading…' : value.photo ? 'Change photo' : 'Upload photo'}
          </Button>
          {value.photo && (
            <button type="button" className="text-xs text-muted-foreground underline" onClick={() => onChange({ ...value, photo: '' })}>
              Remove photo
            </button>
          )}
        </div>
        <div className="grid flex-1 gap-3 sm:grid-cols-2">
          {FIELDS.map((f) => (
            <div key={f.key} className="space-y-1">
              <Label htmlFor={`site-agent-${f.key}`} className="text-sm font-normal">{f.label}</Label>
              <Input
                id={`site-agent-${f.key}`}
                placeholder={f.placeholder}
                value={value[f.key]}
                onChange={(e) => onChange({ ...value, [f.key]: e.target.value })}
              />
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
