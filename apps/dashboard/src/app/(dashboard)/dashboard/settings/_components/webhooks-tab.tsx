'use client';

import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { TabsContent } from '@/components/ui/tabs';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { RefreshCw } from 'lucide-react';
import { useToast } from '@/hooks/use-toast';
import { useLanguage } from '@/i18n/i18n-provider';
import type { WebhookSettings } from './use-webhook-settings';
import { useSettingsText } from '../_i18n';

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
  const st = useSettingsText();
  const t = st.webhooks;
  const { locale } = useLanguage();
  const when = (iso: string) => new Date(iso).toLocaleString(locale);

  return (
    <TabsContent value="webhooks" className="space-y-4">
      <Card>
        <CardHeader>
          <CardTitle>{t.title}</CardTitle>
          <CardDescription>
            {t.descBefore} <code>`${'{'}timestamp{'}'}.${'{'}body{'}'}`</code> {t.descAfter}
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="webhookUrl">{t.url}</Label>
            <div className="flex gap-2">
              <Input
                id="webhookUrl"
                placeholder="https://yoursite.com/wp-json/spm/v1/sync"
                className="flex-1"
                value={webhookUrl}
                onChange={(e) => setWebhookUrl(e.target.value)}
              />
              <Button onClick={onSaveWebhook} disabled={savingWebhook}>
                {savingWebhook ? st.common.saving : st.common.save}
              </Button>
            </div>
            <p className="text-sm text-muted-foreground">
              {t.urlHelp}
            </p>
          </div>

          <div className="rounded-lg border p-4">
            <div className="flex items-center justify-between gap-4">
              <div>
                <p className="font-medium">{t.secret}</p>
                <p className="text-sm text-muted-foreground">
                  {webhookSecretLast4
                    ? t.secretEndsIn(webhookSecretLast4)
                    : st.common.loading}
                </p>
              </div>
              <Button
                variant="outline"
                size="sm"
                onClick={onRotateSecret}
                disabled={rotatingSecret}
              >
                {rotatingSecret ? t.rotating : t.rotate}
              </Button>
            </div>
            {revealedSecret && (
              <div className="mt-3 rounded-md border border-primary/20 bg-secondary/20 p-3">
                <p className="text-sm font-medium text-primary">
                  {t.newSecret}
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
                      toast({ title: st.common.copied });
                    }}
                  >
                    {st.common.copy}
                  </Button>
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => setRevealedSecret(null)}
                  >
                    {st.common.dismiss}
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
              {sendingTest ? t.sending : t.sendTest}
            </Button>
            <Button
              variant="ghost"
              onClick={() => void loadDeliveries()}
              disabled={loadingDeliveries}
            >
              {loadingDeliveries ? t.refreshing : t.refresh}
            </Button>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>{t.recent}</CardTitle>
          <CardDescription>{t.recentHelp}</CardDescription>
        </CardHeader>
        <CardContent>
          {deliveries.length === 0 ? (
            <p className="text-sm text-muted-foreground">
              {loadingDeliveries
                ? st.common.loading
                : t.noDeliveries}
            </p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b text-left">
                    <th className="py-2 pr-3 font-medium">{t.cols.event}</th>
                    <th className="py-2 pr-3 font-medium">{t.cols.status}</th>
                    <th className="py-2 pr-3 font-medium">{t.cols.attempts}</th>
                    <th className="py-2 pr-3 font-medium">{t.cols.http}</th>
                    <th className="py-2 pr-3 font-medium">{t.cols.when}</th>
                    <th className="py-2 pr-3 font-medium">{t.cols.lastError}</th>
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
                          {t.statuses[d.status] ?? d.status}
                        </span>
                      </td>
                      <td className="py-2 pr-3">{d.attemptCount}</td>
                      <td className="py-2 pr-3">
                        {d.lastStatusCode ?? '\u2014'}
                      </td>
                      <td className="py-2 pr-3 text-xs text-muted-foreground">
                        {when(d.createdAt)}
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
              {t.delivery(selectedDelivery ? String(selectedDelivery.id) : '\u2026')}
            </DialogTitle>
            <DialogDescription>
              {selectedDelivery
                ? `${selectedDelivery.event} — ${t.statuses[selectedDelivery.status] ?? selectedDelivery.status}`
                : st.common.loading}
            </DialogDescription>
          </DialogHeader>
          {selectedDelivery && (
            <div className="space-y-4 text-sm">
              <div className="grid grid-cols-2 gap-2">
                <div>
                  <span className="font-medium">{t.attempts}</span>{' '}
                  {selectedDelivery.attemptCount}
                </div>
                <div>
                  <span className="font-medium">{t.http}</span>{' '}
                  {selectedDelivery.lastStatusCode ?? '\u2014'}
                </div>
                <div>
                  <span className="font-medium">{t.created}</span>{' '}
                  {when(selectedDelivery.createdAt)}
                </div>
                <div>
                  <span className="font-medium">{t.delivered}</span>{' '}
                  {selectedDelivery.deliveredAt
                    ? when(selectedDelivery.deliveredAt)
                    : '\u2014'}
                </div>
              </div>

              {selectedDelivery.targetUrl !== undefined && (
                <div>
                  <p className="font-medium mb-1">{t.targetUrl}</p>
                  <code className="block bg-muted rounded p-2 text-xs break-all">
                    {selectedDelivery.targetUrl || '\u2014'}
                  </code>
                </div>
              )}

              {selectedDelivery.lastError && (
                <div>
                  <p className="font-medium mb-1 text-primary/70">
                    {t.lastError}
                  </p>
                  <code className="block bg-muted rounded p-2 text-xs whitespace-pre-wrap break-words">
                    {selectedDelivery.lastError}
                  </code>
                </div>
              )}

              <div>
                <p className="font-medium mb-1">{t.payload}</p>
                <pre className="bg-muted rounded p-2 text-xs overflow-x-auto max-h-80">
                  {loadingDeliveryDetail && !selectedDelivery.payload
                    ? st.common.loading
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
              {st.common.close}
            </Button>
            <Button
              onClick={() => void onRedeliver()}
              disabled={redelivering || !selectedDelivery}
            >
              <RefreshCw
                className={`mr-2 h-4 w-4 ${redelivering ? 'animate-spin' : ''}`}
              />
              {redelivering ? t.queuing : t.redeliver}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </TabsContent>
  );
}
