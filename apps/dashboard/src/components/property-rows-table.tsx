'use client';

import type { ReactNode } from 'react';
import { Checkbox } from '@/components/ui/checkbox';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { formatCurrency, hasPrice } from '@/lib/utils';
import { useCommonText } from '@/i18n/common';

// The property table of the Properties page, shared with Buyer Match
// (Matched / Suggested). Pick the columns, add your own before the actions,
// and optionally let rows be ticked.

type Named = Record<string, string> | string | null | undefined;

export interface PropertyRow {
  id: number;
  reference: string;
  title: Named;
  image: string | null;
  location?: { name: Named } | null;
  propertyType?: { name: Named } | null;
  price: number | string | null;
  priceTo?: number | string | null;
  rentalPeriod?: string | null;
  currency: string;
  bedrooms: number | null;
  bedroomsTo?: number | null;
  bathrooms: number | null;
  bathroomsTo?: number | null;
  buildSize?: number | string | null;
  plotSize?: number | string | null;
}

export type PropertyColumn = 'image' | 'reference' | 'type' | 'title' | 'location' | 'price' | 'bedsBaths' | 'beds' | 'baths' | 'sizes';


export interface ExtraColumn<T> {
  key: string;
  header: ReactNode;
  cell: (row: T) => ReactNode;
  className?: string;
}

interface Props<T extends PropertyRow> {
  rows: T[];
  columns: PropertyColumn[];
  headers?: Partial<Record<PropertyColumn, string>>;
  extra?: ExtraColumn<T>[];
  // Last column (menu, buttons), no header.
  actions?: (row: T) => ReactNode;
  selection?: {
    selected: Set<number>;
    onChange: (next: Set<number>) => void;
    label?: (row: T) => string;
    allLabel?: string;
  };
  noImage?: string;
  // Shown under the title (e.g. Buyer Match wishes met / missed).
  titleExtra?: (row: T) => ReactNode;
  rowClassName?: (row: T) => string | undefined;
}

export function displayName(name: Named): string {
  if (!name) return '';
  if (typeof name === 'string') return name;
  return name.en || Object.values(name).find(Boolean) || '';
}

// periods: the rental period words (week / month / night) in the dashboard language.
export function formatRowPrice(row: Pick<PropertyRow, 'price' | 'priceTo' | 'currency' | 'rentalPeriod'>, onRequest = 'POA', periods?: Record<string, string>): string {
  if (!hasPrice(row.price)) return onRequest;
  const from = formatCurrency(Number(row.price), row.currency);
  const to = Number(row.priceTo) > Number(row.price) ? ` – ${formatCurrency(Number(row.priceTo), row.currency)}` : '';
  return `${from}${to}${row.rentalPeriod ? ` / ${periods?.[row.rentalPeriod] ?? row.rentalPeriod}` : ''}`;
}

function range(from: number | null | undefined, to: number | null | undefined): string {
  if (!from) return '-';
  return to && to > from ? `${from}–${to}` : String(from);
}

function size(v: number | string | null | undefined): string {
  return v ? `${Math.round(Number(v))} m²` : '-';
}

export function PropertyRowsTable<T extends PropertyRow>({
  rows,
  columns,
  headers,
  extra = [],
  actions,
  selection,
  noImage,
  titleExtra,
  rowClassName,
}: Props<T>) {
  const tc = useCommonText().table;
  const head: Record<PropertyColumn, string> = { ...tc, ...headers };
  const allIds = rows.map((r) => r.id);
  const allTicked = !!selection && allIds.length > 0 && allIds.every((id) => selection.selected.has(id));
  const toggle = (id: number) => {
    if (!selection) return;
    const next = new Set(selection.selected);
    if (next.has(id)) next.delete(id);
    else next.add(id);
    selection.onChange(next);
  };
  const toggleAll = () => {
    if (!selection) return;
    const next = new Set(selection.selected);
    for (const id of allIds) {
      if (allTicked) next.delete(id);
      else next.add(id);
    }
    selection.onChange(next);
  };

  const cell = (row: T, col: PropertyColumn): ReactNode => {
    switch (col) {
      case 'image':
        return (
          <div className="h-12 w-16 overflow-hidden rounded-lg bg-muted">
            {row.image ? (
              <img src={row.image} alt="" className="h-full w-full object-cover" />
            ) : (
              <div className="flex h-full w-full items-center justify-center text-xs text-muted-foreground">{noImage ?? tc.noImage}</div>
            )}
          </div>
        );
      case 'reference':
        return <span className="whitespace-nowrap font-mono text-sm">{row.reference}</span>;
      case 'type':
        return displayName(row.propertyType?.name) || '-';
      case 'title':
        return (
          <>
            <span className="block max-w-[220px] truncate">{displayName(row.title) || '-'}</span>
            {titleExtra?.(row)}
          </>
        );
      case 'location':
        return displayName(row.location?.name) || '-';
      case 'price':
        return <span className="whitespace-nowrap">{formatRowPrice(row, tc.poa, tc.periods)}</span>;
      case 'bedsBaths':
        return `${row.bedrooms || '-'} / ${row.bathrooms || '-'}`;
      case 'beds':
        return range(row.bedrooms, row.bedroomsTo);
      case 'baths':
        return range(row.bathrooms, row.bathroomsTo);
      case 'sizes':
        return <span className="whitespace-nowrap">{`${size(row.buildSize)} / ${size(row.plotSize)}`}</span>;
    }
  };

  return (
    <Table>
      <TableHeader>
        <TableRow>
          {selection ? (
            <TableHead className="w-[36px]">
              <Checkbox checked={allTicked} onCheckedChange={toggleAll} aria-label={selection.allLabel ?? 'Select all'} />
            </TableHead>
          ) : null}
          {columns.map((c) => (
            <TableHead key={c} className={c === 'image' ? 'w-[100px]' : undefined}>
              {head[c]}
            </TableHead>
          ))}
          {extra.map((x) => (
            <TableHead key={x.key} className={x.className}>
              {x.header}
            </TableHead>
          ))}
          {actions ? <TableHead className="w-[70px]" /> : null}
        </TableRow>
      </TableHeader>
      <TableBody>
        {rows.map((row) => (
          <TableRow key={row.id} className={rowClassName?.(row)} data-state={selection?.selected.has(row.id) ? 'selected' : undefined}>
            {selection ? (
              <TableCell>
                <Checkbox
                  checked={selection.selected.has(row.id)}
                  onCheckedChange={() => toggle(row.id)}
                  aria-label={selection.label?.(row) ?? row.reference}
                />
              </TableCell>
            ) : null}
            {columns.map((c) => (
              <TableCell key={c}>{cell(row, c)}</TableCell>
            ))}
            {extra.map((x) => (
              <TableCell key={x.key} className={x.className}>
                {x.cell(row)}
              </TableCell>
            ))}
            {actions ? <TableCell>{actions(row)}</TableCell> : null}
          </TableRow>
        ))}
      </TableBody>
    </Table>
  );
}
