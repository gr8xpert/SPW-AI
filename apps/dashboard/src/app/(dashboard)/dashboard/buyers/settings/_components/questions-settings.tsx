'use client';

import { useState } from 'react';
import { ArrowDown, ArrowUp, Loader2, Pencil, Plus, Trash2, X } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { useToast } from '@/hooks/use-toast';
import { useBuyerText } from '../../_i18n/use-buyer-text';
import { useTenantLanguages } from '../../use-buyers';
import {
  textOf, useBuyerQuestions, useCreateQuestion, useDeleteQuestion, useReorderQuestions, useUpdateQuestion,
  type BuyerQuestion, type QuestionInput,
} from '../../use-buyer-follow-up';
import { TranslatedInput, compactTranslations } from './translated-input';

type Draft = Required<QuestionInput>;

const blank = (): Draft => ({ label: {}, options: [{ label: {} }, { label: {} }], multiple: false, showOnForm: true, isActive: true });
const fromQuestion = (q: BuyerQuestion): Draft => ({
  label: { ...q.label },
  options: q.options.map((o) => ({ key: o.key, label: { ...o.label } })),
  multiple: q.multiple,
  showOnForm: q.showOnForm,
  isActive: q.isActive,
});

function QuestionEditor({
  initial,
  languages,
  busy,
  onSave,
  onCancel,
}: {
  initial: Draft;
  languages: string[];
  busy: boolean;
  onSave: (d: Draft) => void;
  onCancel: () => void;
}) {
  const t = useBuyerText();
  const s = t.settingsPage.questions;
  const [d, setD] = useState<Draft>(initial);
  const options = d.options.map((o) => ({ ...o, label: compactTranslations(o.label) })).filter((o) => Object.keys(o.label).length);
  const error = !Object.keys(compactTranslations(d.label)).length ? s.needLabel : !options.length ? s.needOption : null;

  return (
    <div className="space-y-4 rounded-md border bg-muted/20 p-4">
      <div className="space-y-1.5">
        <Label>{s.label}</Label>
        <TranslatedInput value={d.label} languages={languages} onChange={(label) => setD({ ...d, label })} />
      </div>
      <div className="space-y-1.5">
        <Label>{s.options}</Label>
        {d.options.map((o, i) => (
          <div key={o.key ?? `new-${i}`} className="flex items-start gap-1.5">
            <TranslatedInput
              className="flex-1"
              value={o.label}
              languages={languages}
              onChange={(label) => setD({ ...d, options: d.options.map((x, j) => (j === i ? { ...x, label } : x)) })}
            />
            <Button
              type="button"
              variant="ghost"
              size="icon"
              className="h-9 w-9"
              onClick={() => setD({ ...d, options: d.options.filter((_, j) => j !== i) })}
            >
              <X className="h-4 w-4" />
            </Button>
          </div>
        ))}
        <Button type="button" variant="outline" size="sm" onClick={() => setD({ ...d, options: [...d.options, { label: {} }] })}>
          <Plus className="mr-1 h-4 w-4" />
          {s.addOption}
        </Button>
      </div>
      <div className="flex flex-wrap gap-6">
        {(
          [
            ['multiple', s.multiple],
            ['showOnForm', s.showOnForm],
            ['isActive', s.active],
          ] as const
        ).map(([key, label]) => (
          <label key={key} className="flex items-center gap-2 text-sm">
            <Switch checked={d[key]} onCheckedChange={(v) => setD({ ...d, [key]: v })} />
            {label}
          </label>
        ))}
      </div>
      {error ? <p className="text-sm text-destructive">{error}</p> : null}
      <div className="flex justify-end gap-2">
        <Button variant="outline" size="sm" onClick={onCancel}>
          {s.cancel}
        </Button>
        <Button
          size="sm"
          disabled={!!error || busy}
          onClick={() => onSave({ ...d, label: compactTranslations(d.label), options })}
        >
          {busy ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
          {s.save}
        </Button>
      </div>
    </div>
  );
}

export function QuestionsSettings({ canEdit }: { canEdit: boolean }) {
  const t = useBuyerText();
  const s = t.settingsPage.questions;
  const { toast } = useToast();
  const questions = useBuyerQuestions();
  const langs = useTenantLanguages();
  const create = useCreateQuestion();
  const update = useUpdateQuestion();
  const reorder = useReorderQuestions();
  const remove = useDeleteQuestion();
  const [editing, setEditing] = useState<number | 'new' | null>(null);
  const list = questions.data ?? [];
  const languages = langs.data ?? ['en'];
  const fail = (err: Error) => toast({ title: s.failed, description: err.message, variant: 'destructive' });
  const done = () => {
    setEditing(null);
    toast({ title: s.saved });
  };

  const move = (index: number, dir: -1 | 1) => {
    const ids = list.map((q) => q.id);
    const j = index + dir;
    [ids[index], ids[j]] = [ids[j], ids[index]];
    reorder.mutate(ids, { onError: fail });
  };

  return (
    <Card className="max-w-4xl">
      <CardHeader className="flex flex-row items-start justify-between gap-4 pb-3">
        <div>
          <CardTitle className="text-base">{t.settingsPage.tabs.questions}</CardTitle>
          <CardDescription>{s.description}</CardDescription>
        </div>
        {canEdit && editing !== 'new' ? (
          <Button size="sm" variant="outline" onClick={() => setEditing('new')}>
            <Plus className="mr-1 h-4 w-4" />
            {s.add}
          </Button>
        ) : null}
      </CardHeader>
      <CardContent className="space-y-2">
        {editing === 'new' ? (
          <QuestionEditor
            initial={blank()}
            languages={languages}
            busy={create.isPending}
            onCancel={() => setEditing(null)}
            onSave={(d) => create.mutate(d, { onSuccess: done, onError: fail })}
          />
        ) : null}
        {questions.isLoading ? (
          <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
        ) : (
          list.map((q, i) =>
            editing === q.id ? (
              <QuestionEditor
                key={q.id}
                initial={fromQuestion(q)}
                languages={languages}
                busy={update.isPending}
                onCancel={() => setEditing(null)}
                onSave={(d) => update.mutate({ id: q.id, ...d }, { onSuccess: done, onError: fail })}
              />
            ) : (
              <div key={q.id} className="flex items-start gap-3 rounded-md border p-3">
                <div className="min-w-0 flex-1 space-y-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="text-sm font-medium">{textOf(q.label)}</span>
                    {q.multiple ? <Badge variant="secondary" className="text-[10px]">{s.multipleBadge}</Badge> : null}
                    {!q.isActive ? <Badge variant="outline" className="text-[10px]">{s.inactive}</Badge> : null}
                  </div>
                  <p className="text-xs text-muted-foreground">{q.options.map((o) => textOf(o.label)).join(' · ')}</p>
                </div>
                {canEdit ? (
                  <div className="flex items-center gap-1">
                    <Button variant="ghost" size="icon" className="h-8 w-8" disabled={i === 0} onClick={() => move(i, -1)}>
                      <ArrowUp className="h-4 w-4" />
                    </Button>
                    <Button variant="ghost" size="icon" className="h-8 w-8" disabled={i === list.length - 1} onClick={() => move(i, 1)}>
                      <ArrowDown className="h-4 w-4" />
                    </Button>
                    <Button variant="ghost" size="icon" className="h-8 w-8" title={s.edit} onClick={() => setEditing(q.id)}>
                      <Pencil className="h-4 w-4" />
                    </Button>
                    <Button
                      variant="ghost"
                      size="icon"
                      className="h-8 w-8"
                      title={s.delete}
                      onClick={() => {
                        if (window.confirm(s.confirmDelete(textOf(q.label)))) remove.mutate(q.id, { onError: fail });
                      }}
                    >
                      <Trash2 className="h-4 w-4" />
                    </Button>
                  </div>
                ) : null}
              </div>
            ),
          )
        )}
      </CardContent>
    </Card>
  );
}
