'use client';

import { useState } from 'react';
import { Download, Loader2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { useApi } from '@/hooks/use-api';
import { useToast } from '@/hooks/use-toast';
import { useBuyerText } from '../_i18n/use-buyer-text';

// Downloads the buyers that match `filters` as CSV (managers; milestone J).
export function ExportButton({ filters, label, variant = 'outline' }: { filters: Record<string, string>; label?: string; variant?: 'outline' | 'default' }) {
  const t = useBuyerText().housekeeping;
  const api = useApi();
  const { toast } = useToast();
  const [busy, setBusy] = useState(false);

  const run = async () => {
    setBusy(true);
    try {
      const qs = new URLSearchParams(Object.entries(filters).filter(([k, v]) => v && k !== 'sort')).toString();
      const res = await api.getRaw(`/api/dashboard/buyers/export.csv${qs ? `?${qs}` : ''}`);
      const name = /filename="([^"]+)"/.exec(res.headers.get('content-disposition') || '')?.[1] || 'buyers.csv';
      const url = URL.createObjectURL(await res.blob());
      const a = document.createElement('a');
      a.href = url;
      a.download = name;
      document.body.appendChild(a);
      a.click();
      a.remove();
      setTimeout(() => URL.revokeObjectURL(url), 10_000);
    } catch (err) {
      toast({ title: t.failed, description: (err as Error).message, variant: 'destructive' });
    } finally {
      setBusy(false);
    }
  };

  return (
    <Button variant={variant} onClick={run} disabled={busy} title={t.exportHint} data-testid="export-csv">
      {busy ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Download className="mr-2 h-4 w-4" />}
      {label ?? t.export}
    </Button>
  );
}
