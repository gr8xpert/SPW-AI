'use client';

import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { TabsContent } from '@/components/ui/tabs';
import { useToast } from '@/hooks/use-toast';
import type { ApiKeySettings } from './use-api-key-cache';

export function ApiKeysTab({ apiKey }: { apiKey: ApiKeySettings }) {
  const { toast } = useToast();
  const {
    apiKeyLast4,
    revealedApiKey,
    setRevealedApiKey,
    rotatingApiKey,
    onRotateApiKey,
  } = apiKey;

  return (
    <TabsContent value="api-keys" className="space-y-4">
      <Card>
        <CardHeader>
          <CardTitle>API Keys</CardTitle>
          <CardDescription>
            Use this key in the <code>x-api-key</code> header to call the public widget API
            (e.g. <code>GET /api/v1/properties</code>) from your website. Keep it on your server
            if possible — anyone with the key can read your published listings within your plan&apos;s
            rate limit.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="rounded-lg border p-4">
            <div className="flex items-center justify-between gap-4">
              <div>
                <p className="font-medium">Widget API Key</p>
                <p className="text-sm text-muted-foreground">
                  {apiKeyLast4
                    ? `Ends in …${apiKeyLast4}. Rotate if it has been leaked — any integration using the old key will stop working immediately.`
                    : 'No key generated yet. Click "Regenerate" to create one.'}
                </p>
              </div>
              <Button
                variant="outline"
                size="sm"
                onClick={onRotateApiKey}
                disabled={rotatingApiKey}
              >
                {rotatingApiKey ? 'Regenerating…' : apiKeyLast4 ? 'Regenerate' : 'Generate'}
              </Button>
            </div>
            {revealedApiKey && (
              <div className="mt-3 rounded-md border border-primary/20 bg-secondary/20 p-3">
                <p className="text-sm font-medium text-primary">
                  New API key — copy it now. It will not be shown again.
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
                      toast({ title: 'Copied to clipboard' });
                    }}
                  >
                    Copy
                  </Button>
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => setRevealedApiKey(null)}
                  >
                    Dismiss
                  </Button>
                </div>
              </div>
            )}
          </div>

          <div className="rounded-lg border p-4 space-y-2">
            <p className="font-medium text-sm">Quick usage</p>
            <pre className="text-xs bg-muted rounded p-3 overflow-x-auto"><code>{`fetch('https://api.spw-ai.com/api/v1/properties?limit=20', {
  headers: { 'x-api-key': 'YOUR_KEY' }
}).then(r => r.json()).then(({ data }) => console.log(data));`}</code></pre>
          </div>
        </CardContent>
      </Card>
    </TabsContent>
  );
}
