'use client';

import { useEffect, useState } from 'react';
import { Loader2, Merge } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';

interface DuplicatePlace {
  id: number;
  path: string;
  status: string;
  clientRows: number;
  aliases: string[];
}

interface DuplicateGroup {
  province: string;
  level: string;
  name: string;
  places: DuplicatePlace[];
}

// Names the template has twice in one province at the same level. A feed
// listing can only land on one of them, so these are where sorting can go
// wrong; merging the wrong copy into the right one fixes it for every client.
export function DuplicatesTab({
  load,
  reloadKey,
  onMerge,
}: {
  load: () => Promise<DuplicateGroup[]>;
  reloadKey: number;
  onMerge: (sourceId: number, targetId: number) => void;
}) {
  const [groups, setGroups] = useState<DuplicateGroup[] | null>(null);
  const [error, setError] = useState('');

  useEffect(() => {
    let live = true;
    setError('');
    load()
      .then((g) => live && setGroups(g))
      .catch((e) => live && setError((e as Error).message || 'Could not load duplicates'));
    return () => {
      live = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [reloadKey]);

  return (
    <Card>
      <CardHeader>
        <CardTitle>Duplicates</CardTitle>
        <CardDescription>
          The same name twice in one province at the same level — usually one copy sits in the wrong municipality. Keep
          the right one and merge the other into it: its name stays as an alternative spelling and clients&apos;
          listings follow.
        </CardDescription>
      </CardHeader>
      <CardContent>
        {error ? (
          <p className="py-8 text-center text-sm text-red-600">{error}</p>
        ) : groups == null ? (
          <div className="flex justify-center py-12">
            <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
          </div>
        ) : groups.length === 0 ? (
          <p className="py-8 text-center text-sm text-muted-foreground">No duplicates.</p>
        ) : (
          <div className="space-y-4" data-testid="duplicates">
            <p className="text-sm text-muted-foreground">{groups.length} name(s) appear more than once.</p>
            {groups.map((g) => (
              <div key={`${g.province}|${g.level}|${g.name}`} className="rounded-md border">
                <p className="border-b bg-muted/40 px-3 py-2 text-sm font-medium">
                  {g.name} <span className="font-normal capitalize text-muted-foreground">· {g.level} · {g.province}</span>
                </p>
                {g.places.map((p) => {
                  const other = g.places.find((x) => x.id !== p.id)!;
                  return (
                    <div key={p.id} className="flex items-center justify-between gap-3 border-b px-3 py-2 text-sm last:border-b-0">
                      <span className="min-w-0">
                        <span className="block truncate">{p.path}</span>
                        <span className="block text-xs text-muted-foreground">
                          used by {p.clientRows} client location(s)
                          {p.aliases.length ? ` · also: ${p.aliases.join(', ')}` : ''}
                          {p.status !== 'ok' ? ` · ${p.status.replace('_', ' ')}` : ''}
                        </span>
                      </span>
                      <Button size="sm" variant="outline" className="shrink-0" onClick={() => onMerge(p.id, other.id)}>
                        <Merge className="mr-1 h-3 w-3" /> Merge this into the other
                      </Button>
                    </div>
                  );
                })}
              </div>
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
