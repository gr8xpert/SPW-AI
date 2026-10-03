'use client';

import { useEffect, useState } from 'react';
import { useToast } from '@/hooks/use-toast';
import { apiDelete, apiGet, apiPost, apiPut } from '@/lib/api';
import type {
  SenderDomainDetail,
  SenderDomainResponse,
  SenderDomainVerifyResponse,
} from './types';

// 5R — sender-domain verification (Email tab).
export function useSenderDomain(accessToken: string | undefined) {
  const { toast } = useToast();
  // `senderDomain` is null both while loading and when the tenant hasn't
  // configured one — UI branches on whether `senderDomainLoaded` flipped true.
  const [senderDomain, setSenderDomain] = useState<SenderDomainDetail | null>(
    null,
  );
  const [senderDomainLoaded, setSenderDomainLoaded] = useState(false);
  const [senderDomainInput, setSenderDomainInput] = useState('');
  const [savingSenderDomain, setSavingSenderDomain] = useState(false);
  const [verifyingSenderDomain, setVerifyingSenderDomain] = useState(false);

  useEffect(() => {
    if (!accessToken) return;
    apiGet<SenderDomainResponse>('/api/dashboard/tenant/email-domain')
      .then((res) => {
        setSenderDomain(res.data);
        if (res.data) setSenderDomainInput(res.data.domain);
      })
      .catch(() => {
        // Non-fatal — user gets the empty state.
      })
      .finally(() => setSenderDomainLoaded(true));
  }, [accessToken]);

  const onSaveSenderDomain = async () => {
    const domain = senderDomainInput.trim();
    if (!domain) return;
    setSavingSenderDomain(true);
    try {
      const res = await apiPut<SenderDomainResponse>(
        '/api/dashboard/tenant/email-domain',
        { domain },
      );
      setSenderDomain(res.data);
      toast({
        title: 'Sender domain saved',
        description:
          'Add the three DNS records below, then click Verify. DNS propagation can take up to a few hours.',
      });
    } catch (err) {
      toast({
        title: 'Failed to save sender domain',
        description: (err as Error).message || 'Unexpected error',
        variant: 'destructive',
      });
    } finally {
      setSavingSenderDomain(false);
    }
  };

  const onVerifySenderDomain = async () => {
    setVerifyingSenderDomain(true);
    try {
      const res = await apiPost<SenderDomainVerifyResponse>(
        '/api/dashboard/tenant/email-domain/verify',
        {},
      );
      // Refetch the full detail so per-record verifiedAt timestamps shown
      // in the UI reflect what the server just stamped.
      const fresh = await apiGet<SenderDomainResponse>(
        '/api/dashboard/tenant/email-domain',
      );
      setSenderDomain(fresh.data);
      const { status, spf, dkim, dmarc } = res.data;
      if (status === 'verified') {
        toast({
          title: 'All three records verified',
          description: 'SPF, DKIM, and DMARC are live.',
        });
      } else {
        const missing = [
          spf.ok ? null : 'SPF',
          dkim.ok ? null : 'DKIM',
          dmarc.ok ? null : 'DMARC',
        ]
          .filter(Boolean)
          .join(', ');
        toast({
          title: status === 'partial' ? 'Partially verified' : 'Not verified',
          description: `Missing or mismatched: ${missing}. DNS updates can take a few hours to propagate.`,
          variant: status === 'partial' ? 'default' : 'destructive',
        });
      }
    } catch (err) {
      toast({
        title: 'Verification check failed',
        description: (err as Error).message || 'Unexpected error',
        variant: 'destructive',
      });
    } finally {
      setVerifyingSenderDomain(false);
    }
  };

  const onRemoveSenderDomain = async () => {
    if (!senderDomain) return;
    const confirmed = window.confirm(
      'Remove the sender domain? You will need to re-add it and republish DNS records to send signed mail from it again.',
    );
    if (!confirmed) return;
    try {
      await apiDelete('/api/dashboard/tenant/email-domain');
      setSenderDomain(null);
      setSenderDomainInput('');
      toast({
        title: 'Sender domain removed',
        description: 'Mail will now send from the system default from-address.',
      });
    } catch (err) {
      toast({
        title: 'Failed to remove',
        description: (err as Error).message || 'Unexpected error',
        variant: 'destructive',
      });
    }
  };

  return {
    senderDomain,
    senderDomainLoaded,
    senderDomainInput,
    setSenderDomainInput,
    savingSenderDomain,
    verifyingSenderDomain,
    onSaveSenderDomain,
    onVerifySenderDomain,
    onRemoveSenderDomain,
  };
}

export type SenderDomainSettings = ReturnType<typeof useSenderDomain>;
