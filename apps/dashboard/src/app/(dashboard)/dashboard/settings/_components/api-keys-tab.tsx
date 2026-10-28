'use client';

import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { TabsContent } from '@/components/ui/tabs';
import { useToast } from '@/hooks/use-toast';
import type { ApiKeySettings } from './use-api-key-cache';
import { useSettingsText } from '../_i18n';
import { WebsiteKeysCard } from './website-keys-card';

export function ApiKeysTab({ apiKey }: { apiKey: ApiKeySettings }) {
  const { toast } = useToast();
  const {
    apiKeyLast4,
    revealedApiKey,
    setRevealedApiKey,
    rotatingApiKey,
    onRotateApiKey,
  } = apiKey;
  const st = useSettingsText();
  const t = st.apiKeys;

  return (
    <TabsContent value="api-keys" className="space-y-4">
      <Card>
        <CardHeader>
          <CardTitle>{t.title}</CardTitle>
          <CardDescription>
            {t.descBefore} <code>x-api-key</code> {t.descMiddle} <code>GET /api/v1/properties</code>{t.descAfter}
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="rounded-lg border p-4">
            <div className="flex items-center justify-between gap-4">
              <div>
                <p className="font-medium">{t.widgetKey}</p>
                <p className="text-sm text-muted-foreground">
                  {apiKeyLast4
                    ? t.endsIn(apiKeyLast4)
                    : t.noKey}
                </p>
              </div>
              <Button
                variant="outline"
                size="sm"
                onClick={onRotateApiKey}
                disabled={rotatingApiKey}
              >
                {rotatingApiKey ? t.regenerating : apiKeyLast4 ? t.regenerate : t.generate}
              </Button>
            </div>
            {revealedApiKey && (
              <div className="mt-3 rounded-md border border-primary/20 bg-secondary/20 p-3">
                <p className="text-sm font-medium text-primary">
                  {t.newKey}
                </p>
                <div className="mt-2 flex items-center gap-2">
                  <code className="flex-1 px-2 py-1 bg-muted rounded text-xs break-all">
                    {revealedApiKey}
                  </code>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => {
                      void navigator.clipboard.writeText(revealedApiKey);
                      toast({ title: st.common.copied });
                    }}
                  >
                    {st.common.copy}
                  </Button>
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => setRevealedApiKey(null)}
                  >
                    {st.common.dismiss}
                  </Button>
                </div>
              </div>
            )}
          </div>

          <div className="rounded-lg border p-4 space-y-2">
            <p className="font-medium text-sm">{t.quickUsage}</p>
            <pre className="text-xs bg-muted rounded p-3 overflow-x-auto"><code>{`fetch('https://api.spw-ai.com/api/v1/properties?limit=20', {
  headers: { 'x-api-key': 'YOUR_KEY' }
}).then(r => r.json()).then(({ data }) => console.log(data));`}</code></pre>
          </div>
        </CardContent>
      </Card>

      <WebsiteKeysCard />
    </TabsContent>
  );
}
