import { cn } from '@/lib/utils';

// One export channel's state, shown as a dot on its Feed Export tab.
export type ExportStatus = 'on' | 'warn' | 'test' | 'off';

const DOT: Record<ExportStatus, { cls: string; label: string }> = {
  on: { cls: 'bg-green-500', label: 'On' },
  warn: { cls: 'bg-amber-500', label: 'On, some listings need attention' },
  test: { cls: 'bg-amber-500', label: 'Test mode' },
  off: { cls: 'bg-muted-foreground/40', label: 'Off' },
};

export function StatusDot({ status }: { status: ExportStatus | undefined }) {
  if (!status) return null;
  const d = DOT[status];
  return <span className={cn('inline-block h-2 w-2 rounded-full mr-2 shrink-0', d.cls)} title={d.label} aria-label={d.label} />;
}
