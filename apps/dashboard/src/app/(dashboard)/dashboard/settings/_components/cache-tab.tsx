'use client';

import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { TabsContent } from '@/components/ui/tabs';
import { RefreshCw } from 'lucide-react';
import type { CacheSettings } from './use-api-key-cache';

export function CacheTab({ cache }: { cache: CacheSettings }) {
  const {
    syncVersion,
    lastClearedAt,
    clearingCache,
    onClearCache,
  } = cache;

  return (
    <TabsContent value="cache">
      <Card>
        <CardHeader>
          <CardTitle>Widget Cache</CardTitle>
          <CardDescription>
            Clear the cache on your live widget and WordPress plugin. Run
            this after updating properties or settings if the changes
            haven&apos;t reached your site yet.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="rounded-lg border p-4">
            <div className="flex items-center justify-between gap-4">
              <div>
                <p className="font-medium">Current sync version</p>
                <p className="text-sm text-muted-foreground">
                  {syncVersion === null
                    ? 'Loading…'
                    : `v${syncVersion} — downstream widgets invalidate their local cache when this number changes`}
                </p>
                {lastClearedAt && (
                  <p className="text-xs text-muted-foreground mt-1">
                    Last cleared: {new Date(lastClearedAt).toLocaleString()}
                  </p>
                )}
              </div>
              <Button
                onClick={onClearCache}
                disabled={clearingCache}
                variant="default"
              >
                <RefreshCw
                  className={`h-4 w-4 mr-2 ${clearingCache ? 'animate-spin' : ''}`}
                />
                {clearingCache ? 'Clearing…' : 'Clear widget cache'}
              </Button>
            </div>
          </div>
          <p className="text-xs text-muted-foreground">
            Replaces the old manual cache-clear PHP script. Widgets that
            poll <code>/api/v1/sync-meta</code> refresh on their next tick
            (within ~1 minute); webhook-subscribed integrations refresh
            immediately.
          </p>
        </CardContent>
      </Card>
    </TabsContent>
  );
}
