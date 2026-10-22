'use client';

import { useEffect, useState } from 'react';
import { Loader2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Label } from '@/components/ui/label';
import { useToast } from '@/hooks/use-toast';
import { cn } from '@/lib/utils';
import { useBuyerText } from '../../_i18n/use-buyer-text';
import type { Buyer } from '../../use-buyers';
import { textOf, useBuyerQuestions, useSetAnswers } from '../../use-buyer-follow-up';
import { FilterSelect } from '../../_components/filter-select';

// The buyer's answers to the client's Buyer questions: a select for single
// choice, chips for several answers.
export function QuestionsCard({ buyer }: { buyer: Buyer }) {
  const t = useBuyerText();
  const { toast } = useToast();
  const questions = useBuyerQuestions();
  const save = useSetAnswers(buyer.id);
  const [answers, setAnswers] = useState<Record<string, string[]>>(buyer.answers ?? {});
  useEffect(() => setAnswers(buyer.answers ?? {}), [buyer.answers]);

  const active = (questions.data ?? []).filter((q) => q.isActive || (buyer.answers ?? {})[q.qkey]);
  const dirty = JSON.stringify(answers) !== JSON.stringify(buyer.answers ?? {});

  const set = (qkey: string, values: string[]) =>
    setAnswers((a) => {
      const next = { ...a };
      if (values.length) next[qkey] = values;
      else delete next[qkey];
      return next;
    });

  const submit = async () => {
    try {
      await save.mutateAsync(answers);
      toast({ title: t.record.saved });
    } catch (err) {
      toast({ title: t.record.saveFailed, description: (err as Error).message, variant: 'destructive' });
    }
  };

  return (
    <Card>
      <CardHeader className="pb-3">
        <CardTitle className="text-base">{t.questions.title}</CardTitle>
        <CardDescription>{t.questions.description}</CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        {questions.isLoading ? (
          <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
        ) : !active.length ? (
          <p className="text-sm text-muted-foreground">{t.questions.none}</p>
        ) : (
          <div className="grid gap-3 sm:grid-cols-2">
            {active.map((q) => {
              const value = answers[q.qkey] ?? [];
              return (
                <div key={q.id} className={cn('space-y-1.5', q.multiple && 'sm:col-span-2')}>
                  <Label>{textOf(q.label)}</Label>
                  {q.multiple ? (
                    <div className="flex flex-wrap gap-1.5">
                      {q.options.map((o) => {
                        const on = value.includes(o.key);
                        return (
                          <button
                            key={o.key}
                            type="button"
                            aria-pressed={on}
                            onClick={() => set(q.qkey, on ? value.filter((v) => v !== o.key) : [...value, o.key])}
                            className={cn(
                              'rounded-full border px-3 py-1 text-xs transition-colors',
                              on ? 'border-primary bg-primary text-primary-foreground' : 'hover:bg-muted',
                            )}
                          >
                            {textOf(o.label)}
                          </button>
                        );
                      })}
                    </div>
                  ) : (
                    <FilterSelect
                      className="w-full"
                      value={value[0] ?? ''}
                      onChange={(v) => set(q.qkey, v ? [v] : [])}
                      anyLabel="—"
                      options={q.options.map((o) => ({ value: o.key, label: textOf(o.label) }))}
                    />
                  )}
                </div>
              );
            })}
          </div>
        )}
        <div className="flex justify-end">
          <Button size="sm" onClick={submit} disabled={!dirty || save.isPending}>
            {save.isPending ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
            {t.record.save}
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}
