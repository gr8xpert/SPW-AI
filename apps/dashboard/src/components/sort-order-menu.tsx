'use client';

import { useState } from 'react';
import { ArrowDownAZ, ArrowDownZA, ArrowDownWideNarrow, ArrowUpDown, Loader2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { useApi } from '@/hooks/use-api';
import { useToast } from '@/hooks/use-toast';
import { useSharedText } from '@/i18n/shared';

type SortBy = 'name' | 'name-desc' | 'count';

// Labels are looked up by `by` in the shared text at render.
const OPTIONS: Array<{ by: SortBy; icon: typeof ArrowDownAZ }> = [
  { by: 'name', icon: ArrowDownAZ },
  { by: 'name-desc', icon: ArrowDownZA },
  { by: 'count', icon: ArrowDownWideNarrow },
];

/**
 * Sorts every level of the Locations or Property Types list at once. The
 * website's search dropdowns follow this order; dragging a row afterwards
 * fine-tunes it.
 */
export function SortOrderMenu({ endpoint, onSorted }: { endpoint: string; onSorted: () => void }) {
  const api = useApi();
  const { toast } = useToast();
  const t = useSharedText().sortOrder;
  const [sorting, setSorting] = useState(false);

  const sort = async (by: SortBy, label: string) => {
    setSorting(true);
    try {
      await api.put(endpoint, { by });
      toast({ title: t.sorted(label), description: t.sortedText });
      onSorted();
    } catch {
      toast({ title: t.failed, description: t.failedText, variant: 'destructive' });
    } finally {
      setSorting(false);
    }
  };

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant="outline" size="sm" disabled={sorting}>
          {sorting ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <ArrowUpDown className="h-4 w-4 mr-2" />}
          {t.button}
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-64">
        <DropdownMenuLabel className="font-normal text-xs text-muted-foreground">
          {t.help}
        </DropdownMenuLabel>
        <DropdownMenuSeparator />
        {OPTIONS.map(({ by, icon: Icon }) => (
          <DropdownMenuItem key={by} onClick={() => sort(by, t.options[by])}>
            <Icon className="h-4 w-4 mr-2" />
            {t.options[by]}
          </DropdownMenuItem>
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
