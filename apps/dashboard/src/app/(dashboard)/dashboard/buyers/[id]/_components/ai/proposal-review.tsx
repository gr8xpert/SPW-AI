'use client';

import { Checkbox } from '@/components/ui/checkbox';
import { Badge } from '@/components/ui/badge';
import { formatNumber } from '@/lib/utils';
import { useBuyerText } from '../../../_i18n/use-buyer-text';
import { nameOf, useMatchOptions } from '../../../use-buyer-match';
import type { AiProposal, NoteRule, WishlistChange } from '../../../use-buyer-ai';

// A rule in words: "No ground floor", "Must have Sea Views", "Price at most 600,000".
export function useRuleWords() {
  const t = useBuyerText().ai.rules;
  const features = useMatchOptions('features');
  const types = useMatchOptions('property-types');
  const locations = useMatchOptions('locations');
  const named = (list: typeof features.data, id: number) => nameOf(list?.find((x) => x.id === id)?.name) || `#${id}`;
  return (r: NoteRule): string => {
    switch (r.kind) {
      case 'floor':
        return r.mode === 'avoid' ? t.kind.floorAvoid(t.floors[r.value] ?? r.value) : t.kind.floorRequire(r.value);
      case 'feature':
        return (r.mode === 'avoid' ? t.kind.featureAvoid : t.kind.featureRequire)(named(features.data, r.featureId));
      case 'type':
        return t.kind.typeAvoid(named(types.data, r.propertyTypeId));
      case 'place':
        return t.kind.placeAvoid(named(locations.data, r.locationId));
      default:
        return (r.kind === 'max' ? t.kind.max : t.kind.min)(t.fields[r.field] ?? r.field, r.field === 'builtYear' ? String(r.value) : formatNumber(r.value));
    }
  };
}

// A wishlist value in words.
export function useChangeWords() {
  const text = useBuyerText();
  const features = useMatchOptions('features');
  const types = useMatchOptions('property-types');
  const locations = useMatchOptions('locations');
  return (field: WishlistChange['field'], v: unknown): string => {
    if (v === null || v === undefined) return '';
    if (Array.isArray(v)) {
      const list = field === 'featureIds' ? features.data : field === 'propertyTypeIds' ? types.data : field === 'locationIds' ? locations.data : null;
      return v
        .map((x) => (field === 'listingTypes' ? text.wishlist.listingTypeNames[String(x)] ?? String(x) : nameOf(list?.find((o) => o.id === x)?.name) || `#${x}`))
        .join(', ');
    }
    return typeof v === 'number' ? formatNumber(v) : String(v);
  };
}

export interface ReviewState {
  changes: Set<string>;
  rules: Set<string>;
}

export const reviewAll = (p: AiProposal): ReviewState => ({ changes: new Set(p.changes.map((c) => c.field)), rules: new Set(p.rules.map((r) => r.id)) });

// What the AI suggested, each line with a tick box (all ticked at first).
export function ProposalReview({ proposal, value, onChange }: { proposal: AiProposal; value: ReviewState; onChange: (v: ReviewState) => void }) {
  const text = useBuyerText();
  const t = text.ai;
  const words = useChangeWords();
  const ruleWords = useRuleWords();
  const missing = proposal.places.filter((p) => p.id === null).map((p) => p.name);
  const toggle = (key: keyof ReviewState, id: string) => {
    const next = new Set(value[key]);
    if (next.has(id)) next.delete(id);
    else next.add(id);
    onChange({ ...value, [key]: next });
  };

  if (!proposal.changes.length && !proposal.rules.length) {
    return (
      <div className="space-y-2 text-sm" data-testid="ai-review-empty">
        <p className="text-muted-foreground">{t.nothingFound}</p>
        {missing.length ? <p className="text-xs text-amber-700 dark:text-amber-400">{t.notFound(missing.join(', '))}</p> : null}
      </div>
    );
  }

  return (
    <div className="space-y-4 text-sm" data-testid="ai-review">
      {proposal.changes.length ? (
        <div className="space-y-2">
          <p className="font-medium">{t.changes}</p>
          {proposal.changes.map((c) => {
            const label = text.history.fields[`wishlist.${c.field}`] ?? c.field;
            const from = words(c.field, c.from);
            const to = words(c.field, c.to);
            return (
              <label key={c.field} className="flex items-start gap-2" data-change={c.field}>
                <Checkbox className="mt-0.5" checked={value.changes.has(c.field)} onCheckedChange={() => toggle('changes', c.field)} aria-label={label} />
                <span className="min-w-0">
                  <span className="text-muted-foreground">{label.replace(/^Wishlist: (.)/, (_m, c: string) => c.toUpperCase())}: </span>
                  <span className="break-words">{t.becomes(from, to)}</span>
                </span>
              </label>
            );
          })}
        </div>
      ) : null}
      {missing.length ? <p className="text-xs text-amber-700 dark:text-amber-400" data-testid="ai-missing-places">{t.notFound(missing.join(', '))}</p> : null}
      {proposal.rules.length ? (
        <div className="space-y-2">
          <p className="font-medium">{t.newRules}</p>
          {proposal.rules.map((r) => (
            <label key={r.id} className="flex items-start gap-2" data-rule={r.id}>
              <Checkbox className="mt-0.5" checked={value.rules.has(r.id)} onCheckedChange={() => toggle('rules', r.id)} aria-label={ruleWords(r)} />
              <span className="min-w-0">
                <span className="font-medium">{ruleWords(r)}</span>{' '}
                <Badge variant={r.strength === 'hard' ? 'default' : 'secondary'} className="h-5 px-1.5 text-[10px]">{r.strength === 'hard' ? t.rules.hard : t.rules.soft}</Badge>
                <span className="block break-words text-xs text-muted-foreground">“{r.text}”</span>
              </span>
            </label>
          ))}
        </div>
      ) : null}
      <p className="text-xs text-muted-foreground">{t.reviewNote}</p>
    </div>
  );
}
