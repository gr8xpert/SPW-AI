'use client';

import { useEffect, useState } from 'react';
import { Loader2, Plus, Search, X } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { apiGet } from '@/lib/api';
import { useLanguage } from '@/i18n/i18n-provider';
import { unwrap, type IdealistaListing } from './idealista-api';
import { useFeedExportText } from './_i18n';

// Hand-picked mode: search the client's own listings and tick the ones to send.
export function IdealistaListingPicker({ ids, onChange }: { ids: number[]; onChange: (ids: number[]) => void }) {
  const [search, setSearch] = useState('');
  const [results, setResults] = useState<IdealistaListing[]>([]);
  const [picked, setPicked] = useState<IdealistaListing[]>([]);
  const [loading, setLoading] = useState(false);
  const t = useFeedExportText();
  const { locale } = useLanguage();

  // Load the picked listings' details once (and when ids arrive from the server).
  useEffect(() => {
    const missing = ids.filter((id) => !picked.some((p) => p.id === id));
    if (!missing.length) return;
    apiGet(`/api/dashboard/feed-export/idealista/listings?ids=${ids.join(',')}`)
      .then((res) => setPicked(unwrap<IdealistaListing[]>(res) || []))
      .catch(() => {});
  }, [ids]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    const timer = setTimeout(() => {
      setLoading(true);
      apiGet(`/api/dashboard/feed-export/idealista/listings?search=${encodeURIComponent(search)}`)
        .then((res) => setResults(unwrap<IdealistaListing[]>(res) || []))
        .catch(() => setResults([]))
        .finally(() => setLoading(false));
    }, 300);
    return () => clearTimeout(timer);
  }, [search]);

  const add = (l: IdealistaListing) => {
    if (ids.includes(l.id)) return;
    setPicked([...picked, l]);
    onChange([...ids, l.id]);
  };
  const remove = (id: number) => {
    setPicked(picked.filter((p) => p.id !== id));
    onChange(ids.filter((x) => x !== id));
  };

  const row = (l: IdealistaListing) => (
    <div className="min-w-0">
      <div className="text-sm font-medium truncate">
        {l.agentReference || l.reference}
        {l.agentReference && <span className="text-muted-foreground font-normal"> · {l.reference}</span>}
        {!l.live && <Badge variant="outline" className="ml-2">{t.picker.notLive}</Badge>}
      </div>
      <div className="text-xs text-muted-foreground truncate">
        {l.title || t.picker.untitled}
        {l.price ? ` · €${Number(l.price).toLocaleString(locale)}` : ''}
        {` · ${l.listingType}`}
      </div>
    </div>
  );

  return (
    <div className="grid gap-4 md:grid-cols-2">
      <div className="space-y-2">
        <div className="relative">
          <Search className="h-4 w-4 absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
          <Input className="pl-9" placeholder={t.picker.search} value={search} onChange={(e) => setSearch(e.target.value)} />
        </div>
        <div className="border rounded-md max-h-[320px] overflow-y-auto divide-y">
          {loading && !results.length ? (
            <div className="p-4 flex justify-center"><Loader2 className="h-4 w-4 animate-spin" /></div>
          ) : results.length === 0 ? (
            <p className="p-4 text-sm text-muted-foreground">{t.picker.noneFound}</p>
          ) : (
            results.map((l) => (
              <div key={l.id} className="flex items-center justify-between gap-2 p-2">
                {row(l)}
                <Button size="sm" variant="outline" disabled={ids.includes(l.id)} onClick={() => add(l)}>
                  <Plus className="h-4 w-4" />
                </Button>
              </div>
            ))
          )}
        </div>
      </div>
      <div className="space-y-2">
        <p className="text-sm font-medium">{t.picker.sentTo(ids.length)}</p>
        <div className="border rounded-md max-h-[360px] overflow-y-auto divide-y">
          {ids.length === 0 ? (
            <p className="p-4 text-sm text-muted-foreground">{t.picker.nothingPicked}</p>
          ) : (
            ids.map((id) => {
              const l = picked.find((p) => p.id === id);
              return (
                <div key={id} className="flex items-center justify-between gap-2 p-2">
                  {l ? row(l) : <span className="text-sm text-muted-foreground">{t.picker.listingN(id)}</span>}
                  <Button size="sm" variant="ghost" onClick={() => remove(id)}>
                    <X className="h-4 w-4" />
                  </Button>
                </div>
              );
            })
          )}
        </div>
      </div>
    </div>
  );
}
