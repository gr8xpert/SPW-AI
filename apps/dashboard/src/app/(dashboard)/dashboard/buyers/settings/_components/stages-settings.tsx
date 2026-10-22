'use client';

import { useEffect, useState } from 'react';
import { ArrowDown, ArrowUp, Loader2, Plus, Trash2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import {
  Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle,
} from '@/components/ui/dialog';
import { useToast } from '@/hooks/use-toast';
import { useBuyerText } from '../../_i18n/use-buyer-text';
import { stageName, useBuyerStages, useTenantLanguages, type BuyerStage } from '../../use-buyers';
import {
  useBuyerBoard, useCreateStage, useDeleteStage, useReorderStages, useUpdateStage,
} from '../../use-buyer-follow-up';
import { FilterSelect } from '../../_components/filter-select';
import { TranslatedInput, compactTranslations } from './translated-input';

type Row = Pick<BuyerStage, 'id' | 'name' | 'color' | 'kind' | 'probability'>;

function StageRow({
  stage,
  languages,
  canEdit,
  first,
  last,
  onMove,
  onDelete,
}: {
  stage: BuyerStage;
  languages: string[];
  canEdit: boolean;
  first: boolean;
  last: boolean;
  onMove: (dir: -1 | 1) => void;
  onDelete: () => void;
}) {
  const t = useBuyerText();
  const s = t.settingsPage.stages;
  const { toast } = useToast();
  const update = useUpdateStage();
  const pick = (x: BuyerStage): Row => ({ id: x.id, name: { ...x.name }, color: x.color, kind: x.kind, probability: x.probability ?? null });
  const [row, setRow] = useState<Row>(() => pick(stage));
  useEffect(() => setRow(pick(stage)), [stage]);
  const original = pick(stage);
  const dirty =
    row.color !== original.color ||
    row.kind !== original.kind ||
    row.probability !== original.probability ||
    JSON.stringify(compactTranslations(row.name)) !== JSON.stringify(compactTranslations(original.name));
  const named = Object.keys(compactTranslations(row.name)).length > 0;

  const save = () =>
    update.mutate(
      { id: stage.id, name: compactTranslations(row.name), color: row.color || undefined, kind: row.kind, probability: row.probability },
      {
        onSuccess: () => toast({ title: s.saved }),
        onError: (err) => toast({ title: s.failed, description: err.message, variant: 'destructive' }),
      },
    );

  return (
    <div className="flex flex-wrap items-start gap-2 rounded-md border p-3">
      <input
        type="color"
        aria-label={s.color}
        className="mt-1 h-7 w-9 cursor-pointer rounded border bg-transparent p-0.5"
        value={row.color || '#64748b'}
        disabled={!canEdit}
        onChange={(e) => setRow({ ...row, color: e.target.value })}
      />
      <TranslatedInput
        className="min-w-[220px] flex-1"
        value={row.name}
        languages={languages}
        maxLength={60}
        disabled={!canEdit}
        onChange={(name) => setRow({ ...row, name })}
      />
      <FilterSelect
        className="w-28"
        value={row.kind === 'open' ? '' : row.kind}
        onChange={(v) => setRow({ ...row, kind: (v || 'open') as Row['kind'] })}
        anyLabel={s.kinds.open}
        options={[
          { value: 'won', label: s.kinds.won },
          { value: 'lost', label: s.kinds.lost },
        ]}
      />
      {row.kind === 'open' ? (
        <Input
          type="number"
          min={0}
          max={100}
          className="w-24"
          placeholder={s.probability}
          title={s.probabilityHint}
          aria-label={s.probability}
          data-testid="stage-probability"
          value={row.probability ?? ''}
          disabled={!canEdit}
          onChange={(e) => setRow({ ...row, probability: e.target.value === '' ? null : Math.max(0, Math.min(100, Math.round(Number(e.target.value)))) })}
        />
      ) : null}
      {canEdit ? (
        <div className="flex items-center gap-1">
          <Button variant="ghost" size="icon" className="h-9 w-9" disabled={first} title={s.up} onClick={() => onMove(-1)}>
            <ArrowUp className="h-4 w-4" />
          </Button>
          <Button variant="ghost" size="icon" className="h-9 w-9" disabled={last} title={s.down} onClick={() => onMove(1)}>
            <ArrowDown className="h-4 w-4" />
          </Button>
          <Button variant="ghost" size="icon" className="h-9 w-9" title={s.delete} onClick={onDelete}>
            <Trash2 className="h-4 w-4" />
          </Button>
          {dirty ? (
            <Button size="sm" onClick={save} disabled={!named || update.isPending}>
              {update.isPending ? <Loader2 className="mr-1 h-4 w-4 animate-spin" /> : null}
              {t.record.save}
            </Button>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}

export function StagesSettings({ canEdit }: { canEdit: boolean }) {
  const t = useBuyerText();
  const s = t.settingsPage.stages;
  const { toast } = useToast();
  const stages = useBuyerStages();
  const langs = useTenantLanguages();
  const board = useBuyerBoard({});
  const create = useCreateStage();
  const reorder = useReorderStages();
  const remove = useDeleteStage();
  const [deleting, setDeleting] = useState<BuyerStage | null>(null);
  const [moveTo, setMoveTo] = useState('');

  const list = stages.data ?? [];
  const languages = langs.data ?? ['en'];
  const fail = (err: Error) => toast({ title: s.failed, description: err.message, variant: 'destructive' });
  const countIn = (id: number) => board.data?.columns[id]?.total ?? 0;

  const move = (index: number, dir: -1 | 1) => {
    const ids = list.map((x) => x.id);
    const j = index + dir;
    [ids[index], ids[j]] = [ids[j], ids[index]];
    reorder.mutate(ids, { onError: fail });
  };

  const confirmDelete = () => {
    if (!deleting) return;
    const n = countIn(deleting.id);
    remove.mutate(
      { id: deleting.id, moveTo: n ? Number(moveTo) : undefined },
      { onSuccess: () => setDeleting(null), onError: fail },
    );
  };

  const deletingCount = deleting ? countIn(deleting.id) : 0;

  return (
    <Card className="max-w-4xl">
      <CardHeader className="flex flex-row items-start justify-between gap-4 pb-3">
        <div>
          <CardTitle className="text-base">{t.settingsPage.tabs.stages}</CardTitle>
          <CardDescription>{s.description}</CardDescription>
        </div>
        {canEdit ? (
          <Button
            size="sm"
            variant="outline"
            disabled={create.isPending}
            onClick={() => create.mutate({ name: { [languages[0] || 'en']: s.newName } }, { onError: fail })}
          >
            <Plus className="mr-1 h-4 w-4" />
            {s.add}
          </Button>
        ) : null}
      </CardHeader>
      <CardContent className="space-y-2">
        {stages.isLoading ? (
          <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
        ) : (
          list.map((stage, i) => (
            <StageRow
              key={stage.id}
              stage={stage}
              languages={languages}
              canEdit={canEdit}
              first={i === 0}
              last={i === list.length - 1}
              onMove={(dir) => move(i, dir)}
              onDelete={() => {
                setMoveTo('');
                setDeleting(stage);
              }}
            />
          ))
        )}
      </CardContent>

      <Dialog open={!!deleting} onOpenChange={(o) => !o && setDeleting(null)}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>{deleting ? s.deleteTitle(stageName(deleting)) : ''}</DialogTitle>
            <DialogDescription>{deletingCount ? s.deleteMove(deletingCount) : s.deleteEmpty}</DialogDescription>
          </DialogHeader>
          {deletingCount ? (
            <FilterSelect
              className="w-full"
              value={moveTo}
              onChange={setMoveTo}
              anyLabel="—"
              options={list.filter((x) => x.id !== deleting?.id).map((x) => ({ value: String(x.id), label: stageName(x) }))}
            />
          ) : null}
          <DialogFooter>
            <Button variant="outline" onClick={() => setDeleting(null)}>
              {s.cancel}
            </Button>
            <Button variant="destructive" onClick={confirmDelete} disabled={remove.isPending || (!!deletingCount && !moveTo)}>
              {remove.isPending ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
              {s.delete}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </Card>
  );
}
