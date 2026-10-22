'use client';

import { useMemo } from 'react';
import { Textarea } from '@/components/ui/textarea';
import { useBuyerText } from '../../_i18n/use-buyer-text';
import type { Buyer } from '../../use-buyers';
import { FieldCard, type FieldDef } from './field-card';

export function NotesTab({ buyer }: { buyer: Buyer }) {
  const t = useBuyerText();
  const fields = useMemo<FieldDef[]>(
    () => [
      {
        key: 'notes',
        label: t.record.notes.title,
        wide: true,
        render: (value, set) => (
          <Textarea rows={12} value={value} maxLength={20000} onChange={(e) => set(e.target.value)} />
        ),
      },
    ],
    [t],
  );
  return <FieldCard buyer={buyer} title={t.record.notes.title} description={t.record.notes.description} fields={fields} />;
}

export function VisitTab({ buyer }: { buyer: Buyer }) {
  const t = useBuyerText();
  const v = t.record.visit;
  const fields = useMemo<FieldDef[]>(
    () => [
      { key: 'visitStart', label: v.start, type: 'date' },
      { key: 'visitEnd', label: v.end, type: 'date' },
    ],
    [v],
  );
  return (
    <FieldCard
      buyer={buyer}
      title={v.title}
      description={v.description}
      fields={fields}
      validate={(d) => (d.visitStart && d.visitEnd && d.visitEnd < d.visitStart ? v.invalid : null)}
    />
  );
}
