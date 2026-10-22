'use client';

import { useEffect, useState } from 'react';
import { useToast } from '@/hooks/use-toast';
import { apiDelete, apiGet, apiPost, apiPut } from '@/lib/api';
import type {
  SenderDomainDetail,
  SenderDomainResponse,
  SenderDomainVerifyResponse,
} from './types';
import { useSettingsText } from '../_i18n';

// 5R — sender-domain verification (Email tab).
export function useSenderDomain(accessToken: string | undefined) {
  const { toast } = useToast();
  const st = useSettingsText();
  const t = st.senderDomain;
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
        title: t.saved,
        description: t.savedText,
      });
    } catch (err) {
      toast({
        title: t.saveFailed,
        description: (err as Error).message || st.common.unexpectedError,
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
          title: t.allVerified,
          description: t.allVerifiedText,
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
          title: status === 'partial' ? t.partial : t.notVerified,
          description: t.missing(missing),
          variant: status === 'partial' ? 'default' : 'destructive',
        });
      }
    } catch (err) {
      toast({
        title: t.verifyFailed,
        description: (err as Error).message || st.common.unexpectedError,
        variant: 'destructive',
      });
    } finally {
      setVerifyingSenderDomain(false);
    }
  };

  const onRemoveSenderDomain = async () => {
    if (!senderDomain) return;
    const confirmed = window.confirm(t.removeConfirm);
    if (!confirmed) return;
    try {
      await apiDelete('/api/dashboard/tenant/email-domain');
      setSenderDomain(null);
      setSenderDomainInput('');
      toast({
        title: t.removed,
        description: t.removedText,
      });
    } catch (err) {
      toast({
        title: t.removeFailed,
        description: (err as Error).message || st.common.unexpectedError,
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
