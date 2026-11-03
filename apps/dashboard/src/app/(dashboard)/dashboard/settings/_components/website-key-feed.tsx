'use client';

import { useState } from 'react';
import { ChevronDown, ChevronUp, FileCode, Lock } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Switch } from '@/components/ui/switch';
import { useToast } from '@/hooks/use-toast';
import { useDashboardAddons } from '@/hooks/use-dashboard-addons';
import { API_URL } from '@/components/feed-export/idealista-api';
import { ExportLogTable } from '@/components/feed-export/export-log-card';
import { useSettingsText } from '../_i18n';
import type { WebsiteKeysText } from './website-keys-text';
import { useSetKeyFeed, type WebsiteKey } from './use-website-keys';

// A website key's own XML feed (Kyero v3): the same listings the key shows,
// as a URL another portal or CRM can read. Part of the Feed Export add-on.
export function WebsiteKeyFeed({ k, slug, t }: { k: WebsiteKey; slug: string; t: WebsiteKeysText }) {
  const st = useSettingsText();
  const { toast } = useToast();
  const { addons, known } = useDashboardAddons();
  const setFeed = useSetKeyFeed();
  const [showLog, setShowLog] = useState(false);
  const fail = (err: Error) => toast({ title: t.failed, description: err.message, variant: 'destructive' });

  // Not known yet = don't lock (a wrong lock is the worse failure).
  if (known && !addons.feedExport) {
    return (
      <p className="mt-3 flex items-center gap-1.5 border-t pt-3 text-xs text-muted-foreground">
        <Lock className="h-3 w-3" />
        {t.feedLocked}
      </p>
    );
  }

  const url = k.feedKey ? `${API_URL}/api/feed/${slug}/properties.xml?key=${encodeURIComponent(k.feedKey)}` : '';

  return (
    <div className="mt-3 space-y-2 border-t pt-3" data-testid={`website-key-feed-${k.id}`}>
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <FileCode className="h-4 w-4 text-muted-foreground" />
          <span className="text-sm font-medium">{t.feedTitle}</span>
        </div>
        <label className="flex items-center gap-2 text-xs text-muted-foreground">
          <Switch
            checked={!!k.feedKey}
            disabled={setFeed.isPending}
            onCheckedChange={(v) => {
              if (!v && !window.confirm(t.feedConfirmOff)) return;
              setFeed.mutate({ id: k.id, enabled: v }, { onError: fail });
            }}
          />
          {k.feedKey ? t.active : t.paused}
        </label>
      </div>
      <p className="text-xs text-muted-foreground">{t.feedHint}</p>
      {k.feedKey && (
        <>
          <div className="flex items-center gap-2">
            <code className="flex-1 break-all rounded bg-muted px-2 py-1 text-xs">{url}</code>
            <Button
              variant="outline"
              size="sm"
              onClick={() => {
                void navigator.clipboard.writeText(url);
                toast({ title: st.common.copied });
              }}
            >
              {st.common.copy}
            </Button>
            <Button
              variant="outline"
              size="sm"
              disabled={setFeed.isPending}
              onClick={() => {
                if (!window.confirm(t.feedConfirmNewLink)) return;
                setFeed.mutate({ id: k.id, enabled: true, rotate: true }, { onError: fail });
              }}
            >
              {t.feedNewLink}
            </Button>
          </div>
          <p className="text-xs text-muted-foreground">
            {!k.isActive
              ? t.feedKeyOff
              : k.feedLastUsedAt
                ? t.feedLastRead(new Date(k.feedLastUsedAt).toLocaleString())
                : t.feedNeverRead}
          </p>
          <Button variant="ghost" size="sm" className="-ml-2" onClick={() => setShowLog(!showLog)}>
            {showLog ? <ChevronUp className="mr-1 h-4 w-4" /> : <ChevronDown className="mr-1 h-4 w-4" />}
            {t.feedLog}
          </Button>
          {showLog && <ExportLogTable format="xml" apiKeyId={k.id} />}
        </>
      )}
    </div>
  );
}
