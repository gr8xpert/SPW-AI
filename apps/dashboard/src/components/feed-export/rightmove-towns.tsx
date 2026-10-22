'use client';

import { useEffect, useState } from 'react';
import { Loader2, RotateCcw, Search } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { useToast } from '@/hooks/use-toast';
import { apiGet, apiPut } from '@/lib/api';
import { errorText, unwrap } from './idealista-api';
import type { RightmoveTown } from './rightmove-api';
import { useFeedExportText } from './_i18n';

// The towns the client's Rightmove listings sit in, and the Rightmove place
// each is sent as. Unmatched towns can be pointed at a place by hand.
export function RightmoveTowns({ onChanged }: { onChanged: () => void }) {
  const { toast } = useToast();
  const tx = useFeedExportText();
  const [data, setData] = useState<{ placeCount: number; towns: RightmoveTown[] } | null>(null);
  const [editing, setEditing] = useState<number | null>(null);
  const [search, setSearch] = useState('');
  const [results, setResults] = useState<Array<{ id: number; label: string }>>([]);
  const [busy, setBusy] = useState(false);

  const load = async () => {
    try {
      setData(unwrap(await apiGet('/api/dashboard/feed-export/rightmove/towns')));
    } catch (err) {
      toast({ title: tx.rmTowns.loadFailed, description: errorText(err, tx.common.somethingWrong), variant: 'destructive' });
    }
  };

  useEffect(() => {
    load();
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    if (editing === null || search.trim().length < 2) {
      setResults([]);
      return;
    }
    const t = setTimeout(async () => {
      try {
        setResults(unwrap(await apiGet(`/api/dashboard/feed-export/rightmove/places?search=${encodeURIComponent(search.trim())}`)));
      } catch {
        setResults([]);
      }
    }, 250);
    return () => clearTimeout(t);
  }, [search, editing]);

  const link = async (locationId: number, rightmoveLocationId: number | null) => {
    setBusy(true);
    try {
      await apiPut('/api/dashboard/feed-export/rightmove/towns', { locationId, rightmoveLocationId });
      setEditing(null);
      setSearch('');
      await load();
      onChanged();
    } catch (err) {
      toast({ title: tx.common.couldNotSave, description: errorText(err, tx.common.somethingWrong), variant: 'destructive' });
    } finally {
      setBusy(false);
    }
  };

  if (!data) return <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />;
  if (!data.placeCount) {
    return (
      <p className="text-sm text-muted-foreground">{tx.rmTowns.notLoaded}</p>
    );
  }
  if (!data.towns.length) return <p className="text-sm text-muted-foreground">{tx.rmTowns.noListings}</p>;
  const unmatched = data.towns.filter((t) => !t.place).length;

  return (
    <div className="space-y-3">
      <p className="text-sm text-muted-foreground">
        {unmatched
          ? tx.rmTowns.unmatched(unmatched)
          : tx.rmTowns.allMatched}
      </p>
      <div className="border rounded-md divide-y max-h-[460px] overflow-y-auto">
        {data.towns.map((t) => (
          <div key={t.locationId} className="p-2 text-sm space-y-2">
            <div className="flex items-center justify-between gap-3">
              <div>
                <span className="font-medium">{t.name}</span>
                {t.parent && <span className="text-muted-foreground"> · {t.parent}</span>}
                <span className="text-muted-foreground"> · {tx.rmTowns.listings(t.listings)}</span>
              </div>
              <div className="flex items-center gap-2 text-right">
                {t.place ? (
                  <span className="text-muted-foreground">{t.place.label}</span>
                ) : (
                  <Badge variant="destructive">{tx.rmTowns.notOnList}</Badge>
                )}
                {t.linked && (
                  <Button variant="ghost" size="icon" title={tx.rmTowns.matchAgain} disabled={busy} onClick={() => link(t.locationId, null)}>
                    <RotateCcw className="h-3.5 w-3.5" />
                  </Button>
                )}
                <Button variant="outline" size="sm" onClick={() => { setEditing(editing === t.locationId ? null : t.locationId); setSearch(''); }}>
                  {editing === t.locationId ? tx.rmTowns.cancel : tx.rmTowns.change}
                </Button>
              </div>
            </div>
            {editing === t.locationId && (
              <div className="space-y-1">
                <div className="relative">
                  <Search className="h-4 w-4 absolute left-2.5 top-2.5 text-muted-foreground" />
                  <Input autoFocus value={search} onChange={(e) => setSearch(e.target.value)} placeholder={tx.rmTowns.search} className="pl-8" />
                </div>
                {results.map((r) => (
                  <button
                    key={r.id}
                    type="button"
                    disabled={busy}
                    onClick={() => link(t.locationId, r.id)}
                    className="block w-full text-left px-2 py-1 rounded hover:bg-muted"
                  >
                    {r.label}
                  </button>
                ))}
              </div>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}
