'use client';

import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { TabsContent } from '@/components/ui/tabs';
import { RefreshCw } from 'lucide-react';
import { useLanguage } from '@/i18n/i18n-provider';
import type { CacheSettings } from './use-api-key-cache';
import { useSettingsText } from '../_i18n';

export function CacheTab({ cache }: { cache: CacheSettings }) {
  const {
    syncVersion,
    lastClearedAt,
    clearingCache,
    onClearCache,
  } = cache;
  const st = useSettingsText();
  const t = st.cache;
  const { locale } = useLanguage();

  return (
    <TabsContent value="cache">
      <Card>
        <CardHeader>
          <CardTitle>{t.title}</CardTitle>
          <CardDescription>{t.description}</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="rounded-lg border p-4">
            <div className="flex items-center justify-between gap-4">
              <div>
                <p className="font-medium">{t.currentVersion}</p>
                <p className="text-sm text-muted-foreground">
                  {syncVersion === null
                    ? st.common.loading
                    : t.versionText(syncVersion)}
                </p>
                {lastClearedAt && (
                  <p className="text-xs text-muted-foreground mt-1">
                    {t.lastCleared(new Date(lastClearedAt).toLocaleString(locale))}
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
                {clearingCache ? t.clearing : t.clear}
              </Button>
            </div>
          </div>
          <p className="text-xs text-muted-foreground">
            {t.footerBefore} <code>/api/v1/sync-meta</code> {t.footerAfter}
          </p>
        </CardContent>
      </Card>
    </TabsContent>
  );
}
