'use client';

import { CircleHelp, ShieldAlert } from 'lucide-react';
import { useBuyerText } from '../../../_i18n/use-buyer-text';
import type { RuleBrief } from '../../../use-buyer-ai';

// Under a matched property: the buyer's rules it breaks, and the hard ones
// its data can't answer.
export function RuleLines({ breaks, unknown }: { breaks?: RuleBrief[]; unknown?: RuleBrief[] }) {
  const t = useBuyerText().ai.rules;
  if (!breaks?.length && !unknown?.length) return null;
  return (
    <>
      {(breaks ?? []).map((r) => (
        <span key={r.id} className="inline-flex items-center gap-0.5 text-xs font-medium text-red-700 dark:text-red-400" data-rule-break={r.id}>
          <ShieldAlert className="h-3 w-3 shrink-0" />
          {t.breaks}: {r.text}
        </span>
      ))}
      {(unknown ?? []).map((r) => (
        <span key={r.id} className="inline-flex items-center gap-0.5 text-xs text-muted-foreground" data-rule-unknown={r.id}>
          <CircleHelp className="h-3 w-3 shrink-0" />
          {t.unknown}: {r.text}
        </span>
      ))}
    </>
  );
}
