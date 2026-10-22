'use client';

import { useEffect, useState } from 'react';
import { Search, X } from 'lucide-react';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Switch } from '@/components/ui/switch';
import { Label } from '@/components/ui/label';
import { useBuyerText } from '../_i18n/use-buyer-text';
import { BUYER_ROLES, LEAD_SOURCES, stageName, type BuyerAgent, type BuyerListParams, type BuyerStage } from '../use-buyers';
import { FilterSelect } from './filter-select';
import { textOf, type BuyerQuestion } from '../use-buyer-follow-up';

export type BuyerFilterValues = Required<Pick<BuyerListParams, 'q' | 'role' | 'agentId' | 'stageId' | 'priority' | 'source' | 'stale' | 'hot' | 'answer' | 'sort'>>;

export function BuyerFilters({
  values,
  onChange,
  stages,
  agents,
  questions = [],
  showSort = true,
  showStage = true,
}: {
  values: BuyerFilterValues;
  onChange: (patch: Partial<BuyerFilterValues>) => void;
  stages: BuyerStage[];
  agents: BuyerAgent[];
  questions?: BuyerQuestion[];
  showSort?: boolean;
  showStage?: boolean;
}) {
  const t = useBuyerText();
  const [q, setQ] = useState(values.q);

  // Debounced search; follows the URL when it changes elsewhere (Clear).
  useEffect(() => setQ(values.q), [values.q]);
  useEffect(() => {
    if (q === values.q) return;
    const id = setTimeout(() => onChange({ q }), 300);
    return () => clearTimeout(id);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [q]);

  const active = Object.entries(values).some(([k, v]) => k !== 'sort' && v);

  return (
    <div className="flex flex-wrap items-center gap-2">
      <div className="relative w-full sm:w-64">
        <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
        <Input value={q} onChange={(e) => setQ(e.target.value)} placeholder={t.search} className="h-9 pl-9" />
      </div>
      <FilterSelect
        value={values.role}
        onChange={(role) => onChange({ role })}
        anyLabel={t.allRoles}
        options={BUYER_ROLES.map((r) => ({ value: r, label: t.roles[r] }))}
      />
      <FilterSelect
        value={values.agentId}
        onChange={(agentId) => onChange({ agentId })}
        anyLabel={t.allAgents}
        options={agents.map((a) => ({ value: String(a.id), label: a.name || a.email }))}
      />
      {showStage ? <FilterSelect
        value={values.stageId}
        onChange={(stageId) => onChange({ stageId })}
        anyLabel={t.allStages}
        options={stages.map((s) => ({ value: String(s.id), label: stageName(s) }))}
      /> : null}
      <FilterSelect
        value={values.priority}
        onChange={(priority) => onChange({ priority })}
        anyLabel={t.anyPriority}
        className="w-[130px]"
        options={[3, 2, 1, 0].map((n) => ({ value: String(n), label: n ? '★'.repeat(n) : '☆' }))}
      />
      <FilterSelect
        value={values.source}
        onChange={(source) => onChange({ source })}
        anyLabel={t.allSources}
        options={LEAD_SOURCES.map((s) => ({ value: s, label: t.sources[s] }))}
      />
      {questions.length ? (
        <FilterSelect
          value={values.answer}
          onChange={(answer) => onChange({ answer })}
          anyLabel={t.anyAnswer}
          className="w-[220px]"
          options={questions
            .filter((q) => q.isActive)
            .flatMap((q) => q.options.map((o) => ({ value: `${q.qkey}:${o.key}`, label: `${textOf(q.label)}: ${textOf(o.label)}` })))}
        />
      ) : null}
      <div className="flex items-center gap-2 px-1">
        <Switch id="buyers-stale" checked={values.stale === 'true'} onCheckedChange={(on) => onChange({ stale: on ? 'true' : '' })} />
        <Label htmlFor="buyers-stale" className="text-sm font-normal">{t.staleOnly}</Label>
      </div>
      <div className="flex items-center gap-2 px-1">
        <Switch id="buyers-hot" checked={values.hot === 'true'} onCheckedChange={(on) => onChange({ hot: on ? 'true' : '' })} />
        <Label htmlFor="buyers-hot" className="text-sm font-normal">{t.hotOnly}</Label>
      </div>
      {showSort ? <FilterSelect
        value={values.sort}
        onChange={(sort) => onChange({ sort })}
        anyLabel={t.sort.lastActivity}
        className="w-[150px]"
        options={(['created', 'name', 'priority'] as const).map((s) => ({ value: s, label: t.sort[s] }))}
      /> : null}
      {active ? (
        <Button
          variant="ghost"
          size="sm"
          onClick={() => onChange({ q: '', role: '', agentId: '', stageId: '', priority: '', source: '', stale: '', hot: '', answer: '' })}
        >
          <X className="mr-1 h-4 w-4" />
          {t.clearFilters}
        </Button>
      ) : null}
    </div>
  );
}
