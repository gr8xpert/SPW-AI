'use client';

import { Languages } from 'lucide-react';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { LANGUAGES } from './types';

export function LanguageSelect({ value, onChange }: { value: string; onChange: (v: string) => void }) {
  return (
    <Select value={value} onValueChange={onChange}>
      <SelectTrigger className="w-[160px]">
        <Languages className="h-4 w-4 mr-2" />
        <SelectValue />
      </SelectTrigger>
      <SelectContent>
        {LANGUAGES.map((lang) => (
          <SelectItem key={lang.code} value={lang.code}>{lang.label}</SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}

export function MultilingualInput({
  label, lang, value, onChange, placeholder,
}: { label: string; lang: string; value: Record<string, string>; onChange: (lang: string, val: string) => void; placeholder?: string; }) {
  const langLabel = LANGUAGES.find((l) => l.code === lang)?.label || lang.toUpperCase();
  return (
    <div className="space-y-2">
      <Label>{label} ({langLabel})</Label>
      <Input placeholder={placeholder || `${label} in ${langLabel}`} value={value[lang] || ''} onChange={(e) => onChange(lang, e.target.value)} />
    </div>
  );
}

export function MultilingualTextarea({
  label, lang, value, onChange, rows = 6,
}: { label: string; lang: string; value: Record<string, string>; onChange: (lang: string, val: string) => void; rows?: number; }) {
  const langLabel = LANGUAGES.find((l) => l.code === lang)?.label || lang.toUpperCase();
  return (
    <div className="space-y-2">
      <Label>{label} ({langLabel})</Label>
      <Textarea placeholder={`${label} in ${langLabel}`} rows={rows} value={value[lang] || ''} onChange={(e) => onChange(lang, e.target.value)} />
    </div>
  );
}
