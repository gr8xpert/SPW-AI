'use client';

import Link from 'next/link';
import { CalendarClock, Pencil, Trash2, UserRound } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import { useToast } from '@/hooks/use-toast';
import { cn, formatDate } from '@/lib/utils';
import { useBuyerText } from '../_i18n/use-buyer-text';
import { buyerName, type Buyer } from '../use-buyers';
import { buyerWhatsAppBase } from '../use-whatsapp';
import { WhatsAppButton, hasPhoneNumber } from './whatsapp-button';
import { useUpdateTask, type BuyerTask } from '../use-buyer-follow-up';

export function formatDue(iso: string): string {
  return formatDate(iso, { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' });
}

// One task: tick to finish, deadline (red when overdue), who, and the buyer
// when listed outside the buyer's record. With `buyer`, an open task offers a
// WhatsApp follow-up (which can tick it off).
export function TaskRow({
  task,
  showBuyer,
  buyer,
  onEdit,
  onDelete,
}: {
  task: BuyerTask;
  showBuyer?: boolean;
  buyer?: Buyer;
  onEdit?: () => void;
  onDelete?: () => void;
}) {
  const t = useBuyerText();
  const { toast } = useToast();
  const update = useUpdateTask();
  const done = !!task.doneAt;
  const overdue = !done && !!task.dueAt && new Date(task.dueAt).getTime() < Date.now();

  const toggle = (on: boolean) =>
    update.mutate(
      { id: task.id, done: on },
      { onError: (err) => toast({ title: t.tasks.failed, description: err.message, variant: 'destructive' }) },
    );

  return (
    <div className="flex items-start gap-3 rounded-md border p-3">
      <Checkbox
        className="mt-0.5"
        checked={done}
        disabled={update.isPending}
        onCheckedChange={(v) => toggle(!!v)}
        aria-label={done ? t.tasks.markOpen : t.tasks.markDone}
      />
      <div className="min-w-0 flex-1 space-y-1">
        <p className={cn('text-sm font-medium', done && 'text-muted-foreground line-through')}>{task.title}</p>
        {task.notes ? <p className="whitespace-pre-line text-xs text-muted-foreground">{task.notes}</p> : null}
        <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-muted-foreground">
          <span className={cn('flex items-center gap-1', overdue && 'font-medium text-destructive')}>
            <CalendarClock className="h-3 w-3" />
            {task.dueAt ? formatDue(task.dueAt) : t.tasks.noDate}
            {overdue ? ` · ${t.tasks.overdue}` : ''}
          </span>
          <span className="flex items-center gap-1">
            <UserRound className="h-3 w-3" />
            {task.assignedToUser?.name || task.assignedToUser?.email || t.unassigned}
          </span>
          {showBuyer && task.lead ? (
            <Link href={`/dashboard/buyers/${task.lead.id}?tab=tasks`} className="font-medium text-foreground underline-offset-2 hover:underline">
              {buyerName(task.lead)}
            </Link>
          ) : null}
        </div>
      </div>
      {buyer && !done ? (
        <WhatsAppButton
          base={buyerWhatsAppBase(buyer.id)}
          kind="follow_up"
          taskId={task.id}
          hasPhone={hasPhoneNumber(buyer)}
          iconOnly
          variant="ghost"
          className="h-7 w-7 px-0"
          testId="task-whatsapp"
        />
      ) : null}
      {onEdit ? (
        <Button variant="ghost" size="icon" className="h-7 w-7" title={t.tasks.edit} onClick={onEdit}>
          <Pencil className="h-3.5 w-3.5" />
        </Button>
      ) : null}
      {onDelete ? (
        <Button variant="ghost" size="icon" className="h-7 w-7" title={t.tasks.delete} onClick={onDelete}>
          <Trash2 className="h-3.5 w-3.5" />
        </Button>
      ) : null}
    </div>
  );
}
