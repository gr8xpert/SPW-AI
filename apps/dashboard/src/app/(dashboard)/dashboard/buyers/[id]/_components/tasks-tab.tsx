'use client';

import { useState } from 'react';
import { useSession } from 'next-auth/react';
import { Loader2, Plus } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { useToast } from '@/hooks/use-toast';
import { useBuyerText } from '../../_i18n/use-buyer-text';
import { useBuyerAgents, type Buyer } from '../../use-buyers';
import { useBuyerTasks, useCreateTask, useDeleteTask, useUpdateTask, type BuyerTask } from '../../use-buyer-follow-up';
import { FilterSelect } from '../../_components/filter-select';
import { TaskRow } from '../../_components/task-row';

type Draft = { title: string; due: string; assignedTo: string; notes: string };

// datetime-local works in local time without a zone; the API gets ISO.
const toLocalInput = (iso: string | null) => {
  if (!iso) return '';
  const d = new Date(iso);
  return new Date(d.getTime() - d.getTimezoneOffset() * 60_000).toISOString().slice(0, 16);
};
const fromLocalInput = (v: string) => (v ? new Date(v).toISOString() : null);

function TaskForm({
  initial,
  onSave,
  onCancel,
  busy,
}: {
  initial: Draft;
  onSave: (d: Draft) => void;
  onCancel?: () => void;
  busy: boolean;
}) {
  const t = useBuyerText();
  const agents = useBuyerAgents();
  const [d, setD] = useState(initial);
  return (
    <form
      className="space-y-3"
      onSubmit={(e) => {
        e.preventDefault();
        if (d.title.trim()) onSave(d);
      }}
    >
      <div className="space-y-1.5">
        <Label>{t.tasks.title}</Label>
        <Input value={d.title} maxLength={255} onChange={(e) => setD({ ...d, title: e.target.value })} />
      </div>
      <div className="grid gap-3 sm:grid-cols-2">
        <div className="space-y-1.5">
          <Label>{t.tasks.due}</Label>
          <Input type="datetime-local" value={d.due} onChange={(e) => setD({ ...d, due: e.target.value })} />
        </div>
        <div className="space-y-1.5">
          <Label>{t.tasks.assignee}</Label>
          <FilterSelect
            className="w-full"
            value={d.assignedTo}
            onChange={(v) => setD({ ...d, assignedTo: v })}
            anyLabel={t.unassigned}
            options={(agents.data ?? []).map((a) => ({ value: String(a.id), label: a.name || a.email }))}
          />
        </div>
      </div>
      <div className="space-y-1.5">
        <Label>{t.tasks.notes}</Label>
        <Textarea rows={2} value={d.notes} maxLength={5000} onChange={(e) => setD({ ...d, notes: e.target.value })} />
      </div>
      <div className="flex justify-end gap-2">
        {onCancel ? (
          <Button type="button" variant="outline" size="sm" onClick={onCancel}>
            {t.tasks.cancel}
          </Button>
        ) : null}
        <Button type="submit" size="sm" disabled={!d.title.trim() || busy}>
          {busy ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
          {t.tasks.save}
        </Button>
      </div>
    </form>
  );
}

export function TasksTab({ buyer }: { buyer: Buyer }) {
  const t = useBuyerText();
  const { toast } = useToast();
  const tasks = useBuyerTasks(buyer.id);
  const create = useCreateTask(buyer.id);
  const update = useUpdateTask();
  const remove = useDeleteTask();
  const [adding, setAdding] = useState(false);
  const [editing, setEditing] = useState<number | null>(null);
  const { data: session } = useSession();
  const agents = useBuyerAgents();
  // A new task is for the buyer's agent, else for me.
  const me = agents.data?.find((a) => a.email === session?.user?.email);
  const defaultAssignee = buyer.assignedTo ?? me?.id;
  const fail = (err: Error) => toast({ title: t.tasks.failed, description: err.message, variant: 'destructive' });

  const blank: Draft = { title: '', due: '', assignedTo: defaultAssignee ? String(defaultAssignee) : '', notes: '' };
  const toDraft = (x: BuyerTask): Draft => ({
    title: x.title,
    due: toLocalInput(x.dueAt),
    assignedTo: x.assignedTo ? String(x.assignedTo) : '',
    notes: x.notes ?? '',
  });
  const body = (d: Draft) => ({
    title: d.title.trim(),
    dueAt: fromLocalInput(d.due),
    assignedTo: d.assignedTo ? Number(d.assignedTo) : null,
    notes: d.notes.trim(),
  });

  const open = (tasks.data ?? []).filter((x) => !x.doneAt);
  const done = (tasks.data ?? []).filter((x) => x.doneAt);

  return (
    <div className="grid gap-6 lg:grid-cols-[1fr_2fr]">
      <Card className="h-fit">
        <CardHeader className="pb-3">
          <CardTitle className="text-base">{t.tasks.add}</CardTitle>
        </CardHeader>
        <CardContent>
          {adding ? (
            <TaskForm
              initial={blank}
              busy={create.isPending}
              onCancel={() => setAdding(false)}
              onSave={(d) => create.mutate(body(d), { onSuccess: () => setAdding(false), onError: fail })}
            />
          ) : (
            <Button variant="outline" size="sm" onClick={() => setAdding(true)}>
              <Plus className="mr-1 h-4 w-4" />
              {t.tasks.add}
            </Button>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardContent className="space-y-5 p-6">
          {tasks.isLoading ? (
            <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
          ) : !tasks.data?.length ? (
            <p className="text-sm text-muted-foreground">{t.tasks.empty}</p>
          ) : (
            [
              { label: t.tasks.open, rows: open },
              { label: t.tasks.done, rows: done },
            ]
              .filter((g) => g.rows.length)
              .map((g) => (
                <section key={g.label} className="space-y-2">
                  <h3 className="text-sm font-semibold">
                    {g.label} ({g.rows.length})
                  </h3>
                  {g.rows.map((task) =>
                    editing === task.id ? (
                      <div key={task.id} className="rounded-md border p-3">
                        <TaskForm
                          initial={toDraft(task)}
                          busy={update.isPending}
                          onCancel={() => setEditing(null)}
                          onSave={(d) =>
                            update.mutate({ id: task.id, ...body(d), notes: d.notes.trim() || null }, { onSuccess: () => setEditing(null), onError: fail })
                          }
                        />
                      </div>
                    ) : (
                      <TaskRow
                        key={task.id}
                        task={task}
                        buyer={buyer}
                        onEdit={() => setEditing(task.id)}
                        onDelete={() => remove.mutate(task.id, { onError: fail })}
                      />
                    ),
                  )}
                </section>
              ))
          )}
        </CardContent>
      </Card>
    </div>
  );
}
