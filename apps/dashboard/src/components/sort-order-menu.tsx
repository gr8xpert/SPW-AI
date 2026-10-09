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

type SortBy = 'name' | 'name-desc' | 'count';

const OPTIONS: Array<{ by: SortBy; label: string; icon: typeof ArrowDownAZ }> = [
  { by: 'name', label: 'A to Z', icon: ArrowDownAZ },
  { by: 'name-desc', label: 'Z to A', icon: ArrowDownZA },
  { by: 'count', label: 'Most listings first', icon: ArrowDownWideNarrow },
];

/**
 * Sorts every level of the Locations or Property Types list at once. The
 * website's search dropdowns follow this order; dragging a row afterwards
 * fine-tunes it.
 */
export function SortOrderMenu({ endpoint, onSorted }: { endpoint: string; onSorted: () => void }) {
  const api = useApi();
  const { toast } = useToast();
  const [sorting, setSorting] = useState(false);

  const sort = async (by: SortBy, label: string) => {
    setSorting(true);
    try {
      await api.put(endpoint, { by });
      toast({ title: `Sorted ${label}`, description: 'Your website shows the new order.' });
      onSorted();
    } catch {
      toast({ title: 'Could not sort', description: 'Nothing was changed. Try again.', variant: 'destructive' });
    } finally {
      setSorting(false);
    }
  };

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant="outline" size="sm" disabled={sorting}>
          {sorting ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <ArrowUpDown className="h-4 w-4 mr-2" />}
          Sort
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-64">
        <DropdownMenuLabel className="font-normal text-xs text-muted-foreground">
          Replaces the current order on every level. Drag rows to fine-tune. Your website uses this order.
        </DropdownMenuLabel>
        <DropdownMenuSeparator />
        {OPTIONS.map(({ by, label, icon: Icon }) => (
          <DropdownMenuItem key={by} onClick={() => sort(by, label)}>
            <Icon className="h-4 w-4 mr-2" />
            {label}
          </DropdownMenuItem>
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
