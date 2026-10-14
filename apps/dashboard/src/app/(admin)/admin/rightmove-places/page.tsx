'use client';

import { useEffect, useRef, useState } from 'react';
import { Loader2, MapPinned, Upload } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { useApi } from '@/hooks/use-api';
import { useToast } from '@/hooks/use-toast';

function errorText(e: unknown): string {
  const err = e as { response?: { data?: { message?: string | string[] } }; message?: string };
  const m = err?.response?.data?.message;
  return Array.isArray(m) ? m.join(', ') : m || err?.message || 'Something went wrong';
}

// Super Admin → Rightmove places: Rightmove's list of places (their
// "gazetteer"). Every client's Rightmove feed matches its towns against it.
export default function RightmovePlacesPage() {
  const api = useApi();
  const { toast } = useToast();
  const [count, setCount] = useState<number | null>(null);
  const [importing, setImporting] = useState(false);
  const fileInput = useRef<HTMLInputElement>(null);

  const load = async () => {
    try {
      const res: any = await api.get('/api/super-admin/rightmove/places');
      setCount((res?.data ?? res).count);
    } catch (e) {
      toast({ title: 'Could not load the place list', description: errorText(e), variant: 'destructive' });
    }
  };

  useEffect(() => {
    load();
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const importFile = async (file: File) => {
    setImporting(true);
    try {
      const fd = new FormData();
      fd.append('file', file);
      const res: any = await api.post('/api/super-admin/rightmove/places/import', fd);
      const r = res?.data ?? res;
      toast({ title: `Imported ${file.name}`, description: `${r.imported} places in the file: ${r.added} new, ${r.removed} no longer on Rightmove’s list.` });
      await load();
    } catch (e) {
      toast({ title: 'Import failed', description: errorText(e), variant: 'destructive' });
    } finally {
      setImporting(false);
      if (fileInput.current) fileInput.current.value = '';
    }
  };

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold flex items-center gap-2">
          <MapPinned className="h-6 w-6" /> Rightmove places
        </h1>
        <p className="text-muted-foreground">
          Rightmove only places a listing when its region, sub-region and town match their own list. Every client&apos;s Rightmove feed uses this list.
        </p>
      </div>
      <Card>
        <CardHeader>
          <CardTitle>{count === null ? '…' : count.toLocaleString()} places loaded</CardTitle>
          <CardDescription>
            Get the file from Rightmove&apos;s Data Feed team (adfsupport@rightmove.co.uk). CSV or tab-separated, with columns
            Region, Sub Region and Town (a Country column is fine — only Spain is kept). Importing a newer file keeps the places
            already here (and the towns clients linked to them) and drops the ones Rightmove no longer lists.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <Button onClick={() => fileInput.current?.click()} disabled={importing}>
            {importing ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Upload className="mr-2 h-4 w-4" />} Import place list
          </Button>
          <input
            ref={fileInput}
            type="file"
            accept=".csv,.tsv,.txt,text/csv,text/plain"
            className="hidden"
            onChange={(e) => e.target.files?.[0] && importFile(e.target.files[0])}
          />
        </CardContent>
      </Card>
    </div>
  );
}
