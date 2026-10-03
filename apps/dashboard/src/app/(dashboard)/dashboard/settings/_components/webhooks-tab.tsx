'use client';

import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { TabsContent } from '@/components/ui/tabs';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { RefreshCw } from 'lucide-react';
import { useToast } from '@/hooks/use-toast';
import type { WebhookSettings } from './use-webhook-settings';

export function WebhooksTab({ webhook }: { webhook: WebhookSettings }) {
  const { toast } = useToast();
  const {
    webhookUrl,
    setWebhookUrl,
    webhookSecretLast4,
    revealedSecret,
    setRevealedSecret,
    savingWebhook,
    rotatingSecret,
    sendingTest,
    deliveries,
    loadingDeliveries,
    selectedDelivery,
    setSelectedDelivery,
    loadingDeliveryDetail,
    redelivering,
    loadDeliveries,
    openDeliveryDetail,
    onRedeliver,
    onSaveWebhook,
    onRotateSecret,
    onSendTest,
  } = webhook;

  return (
    <TabsContent value="webhooks" className="space-y-4">
      <Card>
        <CardHeader>
          <CardTitle>Webhook Configuration</CardTitle>
          <CardDescription>
            SPM delivers signed POST requests to your URL when properties
            change, cache is cleared, or you click &quot;Send test&quot;
            below. Signatures use HMAC-SHA256 over <code>`${'{'}timestamp{'}'}.${'{'}body{'}'}`</code>
            with the secret shown below. Private IPs and non-HTTP schemes are rejected.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="webhookUrl">Webhook URL</Label>
            <div className="flex gap-2">
              <Input
                id="webhookUrl"
                placeholder="https://yoursite.com/wp-json/spm/v1/sync"
                className="flex-1"
                value={webhookUrl}
                onChange={(e) => setWebhookUrl(e.target.value)}
              />
              <Button onClick={onSaveWebhook} disabled={savingWebhook}>
                {savingWebhook ? 'Saving\u2026' : 'Save'}
              </Button>
            </div>
            <p className="text-sm text-muted-foreground">
              Leave empty to disable webhook delivery.
            </p>
          </div>

          <div className="rounded-lg border p-4">
            <div className="flex items-center justify-between gap-4">
              <div>
                <p className="font-medium">Webhook Secret</p>
                <p className="text-sm text-muted-foreground">
                  {webhookSecretLast4
                    ? `Ends in \u2026${webhookSecretLast4}. Rotate if it has been leaked \u2014 receivers must be updated with the new secret before the next event.`
                    : 'Loading\u2026'}
                </p>
              </div>
              <Button
                variant="outline"
                size="sm"
                onClick={onRotateSecret}
                disabled={rotatingSecret}
              >
                {rotatingSecret ? 'Rotating\u2026' : 'Rotate secret'}
              </Button>
            </div>
            {revealedSecret && (
              <div className="mt-3 rounded-md border border-primary/20 bg-secondary/20 p-3">
                <p className="text-sm font-medium text-primary">
                  New webhook secret \u2014 copy it now. It will not be shown again.
                </p>
                <div className="mt-2 flex items-center gap-2">
                  <code className="flex-1 px-2 py-1 bg-muted rounded text-xs break-all">
                    {revealedSecret}
                  </code>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => {
                      void navigator.clipboard.writeText(revealedSecret);
                      toast({ title: 'Copied to clipboard' });
                    }}
                  >
                    Copy
                  </Button>
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => setRevealedSecret(null)}
                  >
                    Dismiss
                  </Button>
                </div>
              </div>
            )}
          </div>

          <div className="flex gap-2">
            <Button
              variant="outline"
              onClick={onSendTest}
              disabled={sendingTest || !webhookUrl.trim()}
            >
              {sendingTest ? 'Sending\u2026' : 'Send test webhook'}
            </Button>
            <Button
              variant="ghost"
              onClick={() => void loadDeliveries()}
              disabled={loadingDeliveries}
            >
              {loadingDeliveries ? 'Refreshing\u2026' : 'Refresh deliveries'}
            </Button>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Recent Deliveries</CardTitle>
          <CardDescription>
            Last 25 webhook attempts. Failures keep a row so you can see
            why a delivery was dropped.
          </CardDescription>
        </CardHeader>
        <CardContent>
          {deliveries.length === 0 ? (
            <p className="text-sm text-muted-foreground">
              {loadingDeliveries
                ? 'Loading\u2026'
                : 'No deliveries yet. Trigger an event (create a property, click Send test, or clear the cache) to see one here.'}
            </p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b text-left">
                    <th className="py-2 pr-3 font-medium">Event</th>
                    <th className="py-2 pr-3 font-medium">Status</th>
                    <th className="py-2 pr-3 font-medium">Attempts</th>
                    <th className="py-2 pr-3 font-medium">HTTP</th>
                    <th className="py-2 pr-3 font-medium">When</th>
                    <th className="py-2 pr-3 font-medium">Last error</th>
                  </tr>
                </thead>
                <tbody>
                  {deliveries.map((d) => (
                    <tr
                      key={d.id}
                      className="border-b last:border-0 cursor-pointer hover:bg-muted/50"
                      onClick={() => void openDeliveryDetail(d)}
                    >
                      <td className="py-2 pr-3 font-mono text-xs">{d.event}</td>
                      <td className="py-2 pr-3">
                        <span
                          className={
                            d.status === 'delivered'
                              ? 'text-primary'
                              : d.status === 'failed'
                              ? 'text-primary/50'
                              : d.status === 'skipped'
                              ? 'text-primary/70'
                              : 'text-muted-foreground'
                          }
                        >
                          {d.status}
                        </span>
                      </td>
                      <td className="py-2 pr-3">{d.attemptCount}</td>
                      <td className="py-2 pr-3">
                        {d.lastStatusCode ?? '\u2014'}
                      </td>
                      <td className="py-2 pr-3 text-xs text-muted-foreground">
                        {new Date(d.createdAt).toLocaleString()}
                      </td>
                      <td className="py-2 pr-3 text-xs text-muted-foreground max-w-xs truncate">
                        {d.lastError ?? '\u2014'}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Delivery detail drawer. Dialog is the closest fit in our
          component kit — no Sheet primitive available. Opens on row
          click, shows the full payload + the latest attempt outcome,
          and offers Redeliver (admin-only server-side). */}
      <Dialog
        open={selectedDelivery !== null}
        onOpenChange={(open) => !open && setSelectedDelivery(null)}
      >
        <DialogContent className="max-w-3xl">
          <DialogHeader>
            <DialogTitle>
              Delivery #{selectedDelivery?.id ?? '\u2026'}
            </DialogTitle>
            <DialogDescription>
              {selectedDelivery
                ? `${selectedDelivery.event} — ${selectedDelivery.status}`
                : 'Loading\u2026'}
            </DialogDescription>
          </DialogHeader>
          {selectedDelivery && (
            <div className="space-y-4 text-sm">
              <div className="grid grid-cols-2 gap-2">
                <div>
                  <span className="font-medium">Attempts:</span>{' '}
                  {selectedDelivery.attemptCount}
                </div>
                <div>
                  <span className="font-medium">HTTP:</span>{' '}
                  {selectedDelivery.lastStatusCode ?? '\u2014'}
                </div>
                <div>
                  <span className="font-medium">Created:</span>{' '}
                  {new Date(selectedDelivery.createdAt).toLocaleString()}
                </div>
                <div>
                  <span className="font-medium">Delivered:</span>{' '}
                  {selectedDelivery.deliveredAt
                    ? new Date(
                        selectedDelivery.deliveredAt,
                      ).toLocaleString()
                    : '\u2014'}
                </div>
              </div>

              {selectedDelivery.targetUrl !== undefined && (
                <div>
                  <p className="font-medium mb-1">Target URL</p>
                  <code className="block bg-muted rounded p-2 text-xs break-all">
                    {selectedDelivery.targetUrl || '\u2014'}
                  </code>
                </div>
              )}

              {selectedDelivery.lastError && (
                <div>
                  <p className="font-medium mb-1 text-primary/70">
                    Last error
                  </p>
                  <code className="block bg-muted rounded p-2 text-xs whitespace-pre-wrap break-words">
                    {selectedDelivery.lastError}
                  </code>
                </div>
              )}

              <div>
                <p className="font-medium mb-1">Payload</p>
                <pre className="bg-muted rounded p-2 text-xs overflow-x-auto max-h-80">
                  {loadingDeliveryDetail && !selectedDelivery.payload
                    ? 'Loading\u2026'
                    : JSON.stringify(
                        selectedDelivery.payload ?? {},
                        null,
                        2,
                      )}
                </pre>
              </div>
            </div>
          )}
          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => setSelectedDelivery(null)}
              disabled={redelivering}
            >
              Close
            </Button>
            <Button
              onClick={() => void onRedeliver()}
              disabled={redelivering || !selectedDelivery}
            >
              <RefreshCw
                className={`mr-2 h-4 w-4 ${redelivering ? 'animate-spin' : ''}`}
              />
              {redelivering ? 'Queuing\u2026' : 'Redeliver'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </TabsContent>
  );
}
