'use client';

import { cn } from '@/lib/utils';
import { useFeedExportText } from './_i18n';

// One export channel's state, shown as a dot on its Feed Export tab.
export type ExportStatus = 'on' | 'warn' | 'test' | 'off';

// The label of each state is t.status[state].
const DOT: Record<ExportStatus, string> = {
  on: 'bg-green-500',
  warn: 'bg-amber-500',
  test: 'bg-amber-500',
  off: 'bg-muted-foreground/40',
};

export function StatusDot({ status }: { status: ExportStatus | undefined }) {
  const t = useFeedExportText();
  if (!status) return null;
  const label = t.status[status];
  return <span className={cn('inline-block h-2 w-2 rounded-full mr-2 shrink-0', DOT[status])} title={label} aria-label={label} />;
}
