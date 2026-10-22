'use client';

import { useMemo } from 'react';
import { formatDate } from '@/lib/utils';
import { useBuyerText } from '../../_i18n/use-buyer-text';
import { useTenantLanguages, type Buyer } from '../../use-buyers';
import { FilterSelect } from '../../_components/filter-select';
import { PhotoUpload } from '@/components/photo-upload';
import { FieldCard, type FieldDef } from './field-card';
import { QuestionsCard } from './questions-card';

const LANG_NAMES: Record<string, string> = {
  en: 'English', es: 'Spanish', de: 'German', fr: 'French', nl: 'Dutch', it: 'Italian', pt: 'Portuguese',
  ru: 'Russian', sv: 'Swedish', no: 'Norwegian', da: 'Danish', fi: 'Finnish', pl: 'Polish',
};

export function DetailsTab({ buyer }: { buyer: Buyer }) {
  const t = useBuyerText();
  const c = t.record.contact;
  const langs = useTenantLanguages();

  const contactFields = useMemo<FieldDef[]>(
    () => [
      { key: 'firstName', label: c.firstName, maxLength: 100 },
      { key: 'lastName', label: c.lastName, maxLength: 100 },
      { key: 'email', label: c.email, type: 'email' },
      { key: 'phone', label: c.phone, maxLength: 50 },
      { key: 'mobile', label: c.mobile, maxLength: 50 },
      {
        key: 'preferredContact',
        label: c.preferredContact,
        render: (value, set) => (
          <FilterSelect
            className="w-full"
            value={value}
            onChange={set}
            anyLabel="—"
            options={(['call', 'email', 'whatsapp'] as const).map((p) => ({ value: p, label: t.preferredContact[p] }))}
          />
        ),
      },
      {
        key: 'language',
        label: c.language,
        render: (value, set) => {
          const codes = Array.from(new Set([...(langs.data ?? ['en']), ...(value ? [value] : [])]));
          return (
            <FilterSelect
              className="w-full"
              value={value}
              onChange={set}
              anyLabel="—"
              options={codes.map((l) => ({ value: l, label: LANG_NAMES[l] ? `${LANG_NAMES[l]} (${l})` : l }))}
            />
          );
        },
      },
      // Pairs: language | country, street full width, then street 2 | city
      // and ZIP | state, so no row is left half empty.
      { key: 'country', label: c.country, maxLength: 2 },
      { key: 'street', label: c.street, maxLength: 255, wide: true },
      { key: 'street2', label: c.street2, maxLength: 255 },
      { key: 'city', label: c.city, maxLength: 100 },
      { key: 'zip', label: c.zip, maxLength: 20 },
      { key: 'state', label: c.state, maxLength: 100 },
      // Last, full width. Uploaded to R2
      // (dashboard upload route); saved with the card's Save.
      {
        key: 'photoUrl',
        label: c.photoUrl,
        wide: true,
        render: (value, set) => (
          <PhotoUpload
            layout="row"
            value={value}
            onChange={set}
            initials={[buyer.firstName, buyer.lastName].filter(Boolean).map((n) => String(n).charAt(0)).join('').toUpperCase()}
          />
        ),
      },
    ],
    [c, t, langs.data, buyer.firstName, buyer.lastName],
  );

  const legalFields = useMemo<FieldDef[]>(
    () => [
      {
        key: 'idType',
        label: t.record.legal.idType,
        render: (value, set) => (
          <FilterSelect
            className="w-full"
            value={value}
            onChange={set}
            anyLabel="—"
            options={(Object.keys(t.idTypes) as (keyof typeof t.idTypes)[]).map((k) => ({ value: k, label: t.idTypes[k] }))}
          />
        ),
      },
      { key: 'idNumber', label: t.record.legal.idNumber, maxLength: 50 },
      { key: 'lawyer', label: t.record.legal.lawyer, maxLength: 255, wide: true },
    ],
    [t],
  );

  const p = t.record.pipeline;
  const pipelineFields = useMemo<FieldDef[]>(
    () => [
      {
        key: 'subStatus',
        label: p.subStatus,
        render: (value, set) => (
          <FilterSelect
            className="w-full"
            value={value}
            onChange={set}
            anyLabel="—"
            options={(Object.keys(t.subStatuses) as (keyof typeof t.subStatuses)[]).map((k) => ({ value: k, label: t.subStatuses[k] }))}
          />
        ),
      },
      { key: 'dealValue', label: p.dealValue, type: 'number' },
      { key: 'waitingReplyAt', label: p.waitingReplyAt, type: 'date' },
      { key: 'referredBy', label: p.referredBy, maxLength: 150 },
      { key: 'referralPercent', label: p.referralPercent, type: 'number' },
    ],
    [p, t],
  );

  const initialContact = useMemo(() => ({ email: buyer.contact?.email ?? '' }), [buyer.contact?.email]);

  return (
    <div className="grid gap-6 xl:grid-cols-2">
      <FieldCard buyer={buyer} title={c.title} fields={contactFields} initial={initialContact} />
      <div className="space-y-6">
        <QuestionsCard buyer={buyer} />
        <FieldCard buyer={buyer} title={t.record.legal.title} fields={legalFields} />
        <FieldCard
          buyer={buyer}
          title={p.title}
          description={`${p.source}: ${t.sources[buyer.source] ?? buyer.source} · ${p.created}: ${formatDate(buyer.createdAt)}`}
          fields={pipelineFields}
          validate={(d) => {
            const pct = d.referralPercent === '' ? null : Number(d.referralPercent);
            return pct !== null && (pct < 0 || pct > 100) ? '0–100' : null;
          }}
        />
      </div>
    </div>
  );
}
