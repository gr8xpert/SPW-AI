'use client';

import { useEffect, useState } from 'react';
import { useToast } from '@/hooks/use-toast';
import { apiGet, apiPost, apiPut } from '@/lib/api';
import type {
  WebhookConfigResponse,
  WebhookDeliveriesResponse,
  WebhookDeliveryDetailResponse,
  WebhookDeliveryRow,
  WebhookRotateResponse,
} from './types';

// Webhook management (5E). Loads the current URL + last4 of the signing
// secret and the recent deliveries once the token exists. `webhookUrl` also
// decides whether the page shows the Webhooks tab at all.
export function useWebhookSettings(accessToken: string | undefined) {
  const { toast } = useToast();
  // `revealedSecret` holds the rotation result exactly long enough for the
  // user to copy it — the API never returns it again. It's cleared when the
  // user dismisses the reveal box or navigates away.
  const [webhookUrl, setWebhookUrl] = useState<string>('');
  const [webhookSecretLast4, setWebhookSecretLast4] = useState<string | null>(null);
  const [revealedSecret, setRevealedSecret] = useState<string | null>(null);
  const [savingWebhook, setSavingWebhook] = useState(false);
  const [rotatingSecret, setRotatingSecret] = useState(false);
  const [sendingTest, setSendingTest] = useState(false);
  const [deliveries, setDeliveries] = useState<WebhookDeliveryRow[]>([]);
  const [loadingDeliveries, setLoadingDeliveries] = useState(false);

  // Delivery detail drawer state. When non-null, the Dialog renders with
  // the full payload. We keep the detail fetched separately so clicking a
  // row can load a fresh snapshot (attemptCount/status may have advanced
  // since the list was pulled).
  const [selectedDelivery, setSelectedDelivery] =
    useState<WebhookDeliveryRow | null>(null);
  const [loadingDeliveryDetail, setLoadingDeliveryDetail] = useState(false);
  const [redelivering, setRedelivering] = useState(false);

  useEffect(() => {
    if (!accessToken) return;
    apiGet<WebhookConfigResponse>('/api/dashboard/tenant/webhook')
      .then((res) => {
        setWebhookUrl(res.data.webhookUrl ?? '');
        setWebhookSecretLast4(res.data.webhookSecretLast4);
      })
      .catch(() => {
        // Non-fatal — webhook tab renders with an empty form.
      });
  }, [accessToken]);

  const loadDeliveries = async () => {
    setLoadingDeliveries(true);
    try {
      const res = await apiGet<WebhookDeliveriesResponse>(
        '/api/dashboard/tenant/webhook/deliveries?limit=25',
      );
      setDeliveries(res.data);
    } catch (err) {
      toast({
        title: 'Failed to load deliveries',
        description: (err as Error).message || 'Unexpected error',
        variant: 'destructive',
      });
    } finally {
      setLoadingDeliveries(false);
    }
  };

  const openDeliveryDetail = async (row: WebhookDeliveryRow) => {
    // Seed the dialog with what the list already knows so it renders
    // instantly; the fetch fills in targetUrl + payload (the heavy bits
    // kept off the list response for brevity).
    setSelectedDelivery(row);
    setLoadingDeliveryDetail(true);
    try {
      const res = await apiGet<WebhookDeliveryDetailResponse>(
        `/api/dashboard/tenant/webhook/deliveries/${row.id}`,
      );
      setSelectedDelivery(res.data);
    } catch (err) {
      toast({
        title: 'Failed to load delivery detail',
        description: (err as Error).message || 'Unexpected error',
        variant: 'destructive',
      });
    } finally {
      setLoadingDeliveryDetail(false);
    }
  };

  const onRedeliver = async () => {
    if (!selectedDelivery) return;
    setRedelivering(true);
    try {
      await apiPost(
        `/api/dashboard/tenant/webhook/deliveries/${selectedDelivery.id}/redeliver`,
        {},
      );
      toast({
        title: 'Redelivery queued',
        description:
          'A fresh delivery row was created. Refresh the list to see it.',
      });
      setSelectedDelivery(null);
      await loadDeliveries();
    } catch (err) {
      toast({
        title: 'Redelivery failed',
        description: (err as Error).message || 'Unexpected error',
        variant: 'destructive',
      });
    } finally {
      setRedelivering(false);
    }
  };

  // Pull deliveries on mount too — the panel is empty-by-default otherwise,
  // which makes it look broken. Deferred to its own effect so refreshing
  // the list after an action (Test / Rotate) can reuse loadDeliveries
  // without re-running the webhook config fetch.
  useEffect(() => {
    if (!accessToken) return;
    void loadDeliveries();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [accessToken]);

  const onSaveWebhook = async () => {
    setSavingWebhook(true);
    try {
      const res = await apiPut<WebhookConfigResponse>(
        '/api/dashboard/tenant/webhook',
        { webhookUrl: webhookUrl.trim() || null },
      );
      setWebhookUrl(res.data.webhookUrl ?? '');
      setWebhookSecretLast4(res.data.webhookSecretLast4);
      toast({
        title: 'Webhook URL saved',
        description: res.data.webhookUrl
          ? 'We’ll deliver events to this URL going forward.'
          : 'Webhook delivery is now disabled.',
      });
    } catch (err) {
      toast({
        title: 'Failed to save webhook URL',
        description: (err as Error).message || 'Unexpected error',
        variant: 'destructive',
      });
    } finally {
      setSavingWebhook(false);
    }
  };

  const onRotateSecret = async () => {
    const confirmed = window.confirm(
      'Rotate webhook signing secret? Any receiver that has not been updated with the new secret will reject subsequent webhooks.',
    );
    if (!confirmed) return;
    setRotatingSecret(true);
    try {
      const res = await apiPost<WebhookRotateResponse>(
        '/api/dashboard/tenant/webhook/rotate-secret',
      );
      setRevealedSecret(res.data.webhookSecret);
      setWebhookSecretLast4(res.data.webhookSecret.slice(-4));
      toast({
        title: 'Webhook secret rotated',
        description: 'Copy the new secret now — it will not be shown again.',
      });
    } catch (err) {
      toast({
        title: 'Rotate failed',
        description: (err as Error).message || 'Unexpected error',
        variant: 'destructive',
      });
    } finally {
      setRotatingSecret(false);
    }
  };

  const onSendTest = async () => {
    setSendingTest(true);
    try {
      await apiPost('/api/dashboard/tenant/webhook/test');
      toast({
        title: 'Test webhook queued',
        description: 'A webhook.test event was enqueued. Refresh deliveries below to see the outcome.',
      });
      await loadDeliveries();
    } catch (err) {
      toast({
        title: 'Test send failed',
        description: (err as Error).message || 'Unexpected error',
        variant: 'destructive',
      });
    } finally {
      setSendingTest(false);
    }
  };

  return {
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
  };
}

export type WebhookSettings = ReturnType<typeof useWebhookSettings>;
