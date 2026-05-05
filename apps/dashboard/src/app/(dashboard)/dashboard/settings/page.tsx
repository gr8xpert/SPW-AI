'use client';

import { useEffect, useState } from 'react';
import { useSession } from 'next-auth/react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import * as z from 'zod';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';
import {
  Tabs,
  TabsContent,
  TabsList,
  TabsTrigger,
} from '@/components/ui/tabs';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { useToast } from '@/hooks/use-toast';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Building2, Mail, Globe, Webhook, Key, RefreshCw, Bot, Languages, X, Plus, MessageSquare, LayoutGrid, Palette, Heart, Star, Bookmark, Save, ShieldCheck } from 'lucide-react';
import { Switch } from '@/components/ui/switch';
import { Textarea } from '@/components/ui/textarea';
import { apiDelete, apiGet, apiPost, apiPut } from '@/lib/api';

type SlugFormat = 'ref' | 'ref-title' | 'title-ref' | 'location-type-ref' | 'ref-type-location';

const SLUG_FORMAT_OPTIONS: { value: SlugFormat; label: string; example: string }[] = [
  { value: 'ref', label: 'Reference Only', example: '/property/REF-1234' },
  { value: 'ref-title', label: 'Reference + Title', example: '/property/REF-1234-luxury-villa-marbella' },
  { value: 'title-ref', label: 'Title + Reference', example: '/property/luxury-villa-marbella-REF-1234' },
  { value: 'location-type-ref', label: 'Location + Type + Reference', example: '/property/marbella-villa-REF-1234' },
  { value: 'ref-type-location', label: 'Reference + Type + Location', example: '/property/REF-1234-villa-marbella' },
];

const ALL_LANGUAGES: Record<string, string> = {
  en: 'English', es: 'Spanish', de: 'German', fr: 'French', nl: 'Dutch',
  it: 'Italian', ru: 'Russian', sv: 'Swedish', no: 'Norwegian',
  da: 'Danish', pl: 'Polish', cs: 'Czech', fi: 'Finnish',
};

const generalSchema = z.object({
  companyName: z.string().min(1, 'Company name is required'),
  domain: z.string().optional(),
  defaultLanguage: z.string(),
});

const emailSchema = z.object({
  smtpHost: z.string().optional(),
  smtpPort: z.coerce.number().optional(),
  smtpUser: z.string().optional(),
  smtpPassword: z.string().optional(),
  fromEmail: z.string().email().optional().or(z.literal('')),
  fromName: z.string().optional(),
});

// Public widget + WP plugin read from tenant.syncVersion to decide when to
// drop their local cache. Bumping it on demand replaces the old PHP "clear
// cache" script operators used to run by hand.
interface CacheClearResponse {
  data: { tenantId: number; syncVersion: number; clearedAt: string };
}
interface TenantSettings {
  slugFormat?: string;
  companyName?: string;
  defaultLanguage?: string;
  languages?: string[];
  openRouterApiKey?: string;
  openRouterModel?: string;
  aiChatEnabled?: boolean;
  aiChatNLSearch?: boolean;
  aiChatConversational?: boolean;
  aiChatPropertyQA?: boolean;
  aiChatComparison?: boolean;
  aiChatRecommendations?: boolean;
  aiChatMultilingual?: boolean;
  aiChatWelcomeMessage?: string;
  aiChatMaxMessagesPerConversation?: number;
  aiChatConversationTTLDays?: number;
  aiChatAutoEmailAdmin?: boolean;
  bedroomOptions?: number[];
  bathroomOptions?: number[];
  priceOptions?: { sale?: number[]; rent?: number[] };
  enabledListingTypes?: string[];
  primaryColor?: string;
  wishlistIcon?: 'heart' | 'star' | 'bookmark' | 'save';
  mapVariation?: 'auto' | '0' | '1' | '2';
  recaptchaSiteKey?: string;
  recaptchaSecretKey?: string;
  similarPropertiesLimit?: number;
  inquiryNotificationEmails?: string[];
  inquiryWebhookUrl?: string;
  inquiryAutoReplyEnabled?: boolean;
  [key: string]: unknown;
}
interface TenantCurrent {
  data: {
    id: number;
    syncVersion?: number;
    domain?: string;
    settings?: TenantSettings;
  };
}

// Webhook management (5E). The dashboard fetches the current URL + last4 of
// the signing secret on mount, surfaces a deliveries table so operators can
// diagnose "why isn't my site receiving updates?" without DB access, and
// exposes rotate + test buttons.
interface WebhookConfigResponse {
  data: { webhookUrl: string | null; webhookSecretLast4: string };
}
interface WebhookRotateResponse {
  data: { webhookSecret: string };
}
interface WebhookDeliveryRow {
  id: number;
  event: string;
  status: 'pending' | 'delivered' | 'failed' | 'skipped';
  attemptCount: number;
  lastStatusCode: number | null;
  lastError: string | null;
  deliveredAt: string | null;
  createdAt: string;
  // Detail view also surfaces targetUrl + payload. Populated when the
  // drawer opens via a separate GET /deliveries/:id fetch so the list
  // response stays small.
  targetUrl?: string;
  payload?: Record<string, unknown>;
}
interface WebhookDeliveriesResponse {
  data: WebhookDeliveryRow[];
}
interface WebhookDeliveryDetailResponse {
  data: WebhookDeliveryRow;
}

// 5R — sender-domain verification. One row per tenant; if unset the GET
// returns data:null so the UI can branch between "configure" and "verify"
// modes off a single fetch.
interface SenderDomainDetail {
  id: number;
  domain: string;
  dkimSelector: string;
  spfVerifiedAt: string | null;
  dkimVerifiedAt: string | null;
  dmarcVerifiedAt: string | null;
  records: {
    spf: { host: string; type: string; value: string };
    dkim: { host: string; type: string; value: string };
    dmarc: { host: string; type: string; value: string };
  };
  status: 'verified' | 'partial' | 'unverified';
}
interface SenderDomainResponse {
  data: SenderDomainDetail | null;
}
interface SenderDomainVerifyResponse {
  data: {
    spf: { ok: boolean; found: string | null; expected: string };
    dkim: { ok: boolean; found: string | null; expected: string };
    dmarc: { ok: boolean; found: string | null; expected: string };
    status: 'verified' | 'partial' | 'unverified';
  };
}

export default function SettingsPage() {
  const { data: session } = useSession();
  const { toast } = useToast();
  const [savingGeneral, setSavingGeneral] = useState(false);
  const [syncVersion, setSyncVersion] = useState<number | null>(null);
  const [lastClearedAt, setLastClearedAt] = useState<string | null>(null);
  const [clearingCache, setClearingCache] = useState(false);

  // Webhook state. `revealedSecret` holds the rotation result exactly long
  // enough for the user to copy it — the API never returns it again. It's
  // cleared when the user dismisses the reveal box or navigates away.
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

  // Sender domain state (5R). `senderDomain` is null both while loading
  // and when the tenant hasn't configured one — UI branches on whether
  // `senderDomainLoaded` flipped true.
  const [senderDomain, setSenderDomain] = useState<SenderDomainDetail | null>(
    null,
  );
  const [senderDomainLoaded, setSenderDomainLoaded] = useState(false);
  const [senderDomainInput, setSenderDomainInput] = useState('');
  const [savingSenderDomain, setSavingSenderDomain] = useState(false);
  const [verifyingSenderDomain, setVerifyingSenderDomain] = useState(false);
  const [slugFormat, setSlugFormat] = useState<SlugFormat>('ref-title');

  // AI / OpenRouter state
  const [aiApiKey, setAiApiKey] = useState('');
  const [aiApiKeyMasked, setAiApiKeyMasked] = useState('');
  const [aiModel, setAiModel] = useState('anthropic/claude-sonnet-4-20250514');
  const [savingAi, setSavingAi] = useState(false);
  const [testingAi, setTestingAi] = useState(false);
  const [aiTestResult, setAiTestResult] = useState<{ ok: boolean; model?: string; error?: string } | null>(null);

  // AI Chat settings state
  const [aiChatEnabled, setAiChatEnabled] = useState(false);
  const [aiChatNLSearch, setAiChatNLSearch] = useState(true);
  const [aiChatConversational, setAiChatConversational] = useState(true);
  const [aiChatPropertyQA, setAiChatPropertyQA] = useState(true);
  const [aiChatComparison, setAiChatComparison] = useState(true);
  const [aiChatRecommendations, setAiChatRecommendations] = useState(true);
  const [aiChatMultilingual, setAiChatMultilingual] = useState(true);
  const [aiChatWelcomeMessage, setAiChatWelcomeMessage] = useState('');
  const [aiChatMaxMessages, setAiChatMaxMessages] = useState(50);
  const [aiChatTTLDays, setAiChatTTLDays] = useState(7);
  const [aiChatAutoEmailAdmin, setAiChatAutoEmailAdmin] = useState(true);
  const [savingAiChat, setSavingAiChat] = useState(false);

  // Widget search options state
  const [bedroomOptions, setBedroomOptions] = useState<number[]>([1, 2, 3, 4, 5, 6, 7, 8, 9]);
  const [bathroomOptions, setBathroomOptions] = useState<number[]>([1, 2, 3, 4, 5, 6, 7, 8, 9]);
  const [priceOptions, setPriceOptions] = useState<Record<string, number[]>>({
    sale: [50000, 100000, 150000, 200000, 250000, 300000, 400000, 500000, 600000, 750000, 1000000, 1500000, 2000000, 3000000, 5000000],
    rent: [250, 500, 750, 1000, 1500, 2000, 2500, 3000, 4000, 5000, 7500, 10000],
    holiday_rent: [150, 200, 250, 300, 400, 500, 750, 1000, 1500, 2000, 3000, 5000],
  });
  const [enabledListingTypes, setEnabledListingTypes] = useState<string[]>(['sale', 'rent', 'holiday_rent', 'development']);
  const [primaryColor, setPrimaryColor] = useState('#2563eb');
  const [wishlistIcon, setWishlistIcon] = useState<'heart' | 'star' | 'bookmark' | 'save'>('heart');
  const [mapVariation, setMapVariation] = useState<'auto' | '0' | '1' | '2'>('auto');
  const [recaptchaSiteKey, setRecaptchaSiteKey] = useState('');
  const [recaptchaSecretKey, setRecaptchaSecretKey] = useState('');
  const [similarPropertiesLimit, setSimilarPropertiesLimit] = useState(6);
  const [inquiryNotificationEmails, setInquiryNotificationEmails] = useState<string[]>([]);
  const [inquiryEmailInput, setInquiryEmailInput] = useState('');
  const [inquiryWebhookUrl, setInquiryWebhookUrl] = useState('');
  const [inquiryAutoReplyEnabled, setInquiryAutoReplyEnabled] = useState(true);
  const [savingInquiry, setSavingInquiry] = useState(false);
  const [savingWidget, setSavingWidget] = useState(false);

  // Email config state
  const [savingEmail, setSavingEmail] = useState(false);
  const [testingEmail, setTestingEmail] = useState(false);
  const [emailTestResult, setEmailTestResult] = useState<{ success: boolean; error?: string } | null>(null);

  // API key state
  const [apiKeyLast4, setApiKeyLast4] = useState<string | null>(null);
  const [revealedApiKey, setRevealedApiKey] = useState<string | null>(null);
  const [rotatingApiKey, setRotatingApiKey] = useState(false);

  // Tenant-level languages
  const [enabledLanguages, setEnabledLanguages] = useState<string[]>(['en']);
  const [savingLangs, setSavingLangs] = useState(false);

  const AI_MODELS = [
    { value: 'anthropic/claude-sonnet-4-20250514', label: 'Claude Sonnet 4 (Recommended)' },
    { value: 'anthropic/claude-3.5-sonnet', label: 'Claude 3.5 Sonnet' },
    { value: 'openai/gpt-4o-mini', label: 'GPT-4o Mini (Fast & Cheap)' },
    { value: 'openai/gpt-4o', label: 'GPT-4o' },
    { value: 'google/gemini-2.0-flash-001', label: 'Gemini 2.0 Flash' },
  ];

  useEffect(() => {
    if (!session?.accessToken) return;
    apiGet<TenantCurrent>('/api/dashboard/tenant')
      .then((res) => {
        if (typeof res.data?.syncVersion === 'number') {
          setSyncVersion(res.data.syncVersion);
        }
        const settings = res.data?.settings;
        if (settings?.slugFormat) {
          setSlugFormat(settings.slugFormat as SlugFormat);
        }
        if (settings?.companyName) {
          generalForm.setValue('companyName', settings.companyName);
        }
        if (res.data?.domain) {
          generalForm.setValue('domain', res.data.domain);
        }
        if (settings?.defaultLanguage) {
          generalForm.setValue('defaultLanguage', settings.defaultLanguage);
        }
        if (settings?.languages?.length) {
          setEnabledLanguages(settings.languages);
        }
        if (settings?.openRouterApiKey) {
          setAiApiKeyMasked(settings.openRouterApiKey);
        }
        if (settings?.openRouterModel) {
          setAiModel(settings.openRouterModel);
        }
        if (typeof settings?.aiChatEnabled === 'boolean') setAiChatEnabled(settings.aiChatEnabled);
        if (typeof settings?.aiChatNLSearch === 'boolean') setAiChatNLSearch(settings.aiChatNLSearch);
        if (typeof settings?.aiChatConversational === 'boolean') setAiChatConversational(settings.aiChatConversational);
        if (typeof settings?.aiChatPropertyQA === 'boolean') setAiChatPropertyQA(settings.aiChatPropertyQA);
        if (typeof settings?.aiChatComparison === 'boolean') setAiChatComparison(settings.aiChatComparison);
        if (typeof settings?.aiChatRecommendations === 'boolean') setAiChatRecommendations(settings.aiChatRecommendations);
        if (typeof settings?.aiChatMultilingual === 'boolean') setAiChatMultilingual(settings.aiChatMultilingual);
        if (settings?.aiChatWelcomeMessage) setAiChatWelcomeMessage(settings.aiChatWelcomeMessage);
        if (typeof settings?.aiChatMaxMessagesPerConversation === 'number') setAiChatMaxMessages(settings.aiChatMaxMessagesPerConversation);
        if (typeof settings?.aiChatConversationTTLDays === 'number') setAiChatTTLDays(settings.aiChatConversationTTLDays);
        if (typeof settings?.aiChatAutoEmailAdmin === 'boolean') setAiChatAutoEmailAdmin(settings.aiChatAutoEmailAdmin);
        if (Array.isArray(settings?.bedroomOptions)) setBedroomOptions(settings.bedroomOptions);
        if (Array.isArray(settings?.bathroomOptions)) setBathroomOptions(settings.bathroomOptions);
        if (settings?.priceOptions && typeof settings.priceOptions === 'object' && !Array.isArray(settings.priceOptions)) {
          setPriceOptions(settings.priceOptions);
        }
        if (Array.isArray(settings?.enabledListingTypes)) setEnabledListingTypes(settings.enabledListingTypes);
        if (settings?.primaryColor) setPrimaryColor(settings.primaryColor);
        if (settings?.wishlistIcon) setWishlistIcon(settings.wishlistIcon);
        if (settings?.mapVariation) setMapVariation(settings.mapVariation);
        if (settings?.recaptchaSiteKey) setRecaptchaSiteKey(settings.recaptchaSiteKey);
        if (settings?.recaptchaSecretKey) setRecaptchaSecretKey(settings.recaptchaSecretKey);
        if (typeof settings?.similarPropertiesLimit === 'number') setSimilarPropertiesLimit(settings.similarPropertiesLimit);
        if (Array.isArray(settings?.inquiryNotificationEmails)) setInquiryNotificationEmails(settings.inquiryNotificationEmails);
        if (settings?.inquiryWebhookUrl) setInquiryWebhookUrl(settings.inquiryWebhookUrl);
        if (typeof settings?.inquiryAutoReplyEnabled === 'boolean') setInquiryAutoReplyEnabled(settings.inquiryAutoReplyEnabled);
      })
      .catch(() => {});

    apiGet<WebhookConfigResponse>('/api/dashboard/tenant/webhook')
      .then((res) => {
        setWebhookUrl(res.data.webhookUrl ?? '');
        setWebhookSecretLast4(res.data.webhookSecretLast4);
      })
      .catch(() => {
        // Non-fatal — webhook tab renders with an empty form.
      });

    apiGet<SenderDomainResponse>('/api/dashboard/tenant/email-domain')
      .then((res) => {
        setSenderDomain(res.data);
        if (res.data) setSenderDomainInput(res.data.domain);
      })
      .catch(() => {
        // Non-fatal — user gets the empty state.
      })
      .finally(() => setSenderDomainLoaded(true));

    apiGet<{ smtpHost?: string; smtpPort?: number; smtpUser?: string; smtpPassword?: string; fromEmail?: string; fromName?: string } | null>('/api/dashboard/email-config')
      .then((config) => {
        if (config) {
          if (config.smtpHost) emailForm.setValue('smtpHost', config.smtpHost);
          if (config.smtpPort) emailForm.setValue('smtpPort', config.smtpPort);
          if (config.smtpUser) emailForm.setValue('smtpUser', config.smtpUser);
          if (config.fromEmail) emailForm.setValue('fromEmail', config.fromEmail);
          if (config.fromName) emailForm.setValue('fromName', config.fromName);
        }
      })
      .catch(() => {});

    apiGet<{ apiKeyLast4: string }>('/api/dashboard/tenant/api-credentials')
      .then((res) => {
        setApiKeyLast4(res.apiKeyLast4);
      })
      .catch(() => {});
  }, [session?.accessToken]);

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
    if (!session?.accessToken) return;
    void loadDeliveries();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [session?.accessToken]);

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
          ? 'We\u2019ll deliver events to this URL going forward.'
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
        description: 'Copy the new secret now \u2014 it will not be shown again.',
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

  const onClearCache = async () => {
    if (clearingCache) return;
    const confirmed = window.confirm(
      'Clear widget cache now? Your site will refetch listings on the next request. This cannot be undone.',
    );
    if (!confirmed) return;

    setClearingCache(true);
    try {
      const res = await apiPost<CacheClearResponse>('/api/dashboard/tenant/cache/clear');
      setSyncVersion(res.data.syncVersion);
      setLastClearedAt(res.data.clearedAt);
      toast({
        title: 'Widget cache cleared',
        description: `New sync version: ${res.data.syncVersion}. Downstream widgets pick this up on their next poll.`,
      });
    } catch (err) {
      toast({
        title: 'Failed to clear cache',
        description: (err as Error).message || 'Unexpected error',
        variant: 'destructive',
      });
    } finally {
      setClearingCache(false);
    }
  };

  const onSaveAi = async () => {
    setSavingAi(true);
    try {
      const payload: Record<string, string> = { openRouterModel: aiModel };
      if (aiApiKey.trim()) {
        payload.openRouterApiKey = aiApiKey.trim();
      }
      await apiPut('/api/dashboard/tenant/settings', payload);
      if (aiApiKey.trim()) {
        const masked = aiApiKey.length > 8
          ? aiApiKey.slice(0, 5) + '••••' + aiApiKey.slice(-4)
          : '••••••••';
        setAiApiKeyMasked(masked);
        setAiApiKey('');
      }
      setAiTestResult(null);
      toast({ title: 'AI settings saved', description: 'Your OpenRouter configuration has been updated.' });
    } catch (err) {
      toast({ title: 'Failed to save AI settings', description: (err as Error).message || 'Unexpected error', variant: 'destructive' });
    } finally {
      setSavingAi(false);
    }
  };

  const onTestAi = async () => {
    setTestingAi(true);
    setAiTestResult(null);
    try {
      const res = await apiPost<{ data: { ok: boolean; model: string; error?: string } }>(
        '/api/dashboard/translate/test',
      );
      setAiTestResult(res.data);
    } catch (err) {
      setAiTestResult({ ok: false, error: (err as Error).message || 'Connection failed' });
    } finally {
      setTestingAi(false);
    }
  };

  const onSaveAiChat = async () => {
    setSavingAiChat(true);
    try {
      await apiPut('/api/dashboard/tenant/settings', {
        aiChatEnabled,
        aiChatNLSearch,
        aiChatConversational,
        aiChatPropertyQA,
        aiChatComparison,
        aiChatRecommendations,
        aiChatMultilingual,
        aiChatWelcomeMessage: aiChatWelcomeMessage || undefined,
        aiChatMaxMessagesPerConversation: aiChatMaxMessages,
        aiChatConversationTTLDays: aiChatTTLDays,
        aiChatAutoEmailAdmin,
      });
      toast({ title: 'AI Chat settings saved', description: 'Your chat configuration has been updated.' });
    } catch (err) {
      toast({ title: 'Failed to save AI Chat settings', description: (err as Error).message || 'Unexpected error', variant: 'destructive' });
    } finally {
      setSavingAiChat(false);
    }
  };

  const onSaveWidget = async () => {
    setSavingWidget(true);
    try {
      await apiPut('/api/dashboard/tenant/settings', {
        bedroomOptions,
        bathroomOptions,
        priceOptions,
        enabledListingTypes,
        primaryColor,
        wishlistIcon,
        mapVariation,
        recaptchaSiteKey: recaptchaSiteKey.trim() || undefined,
        recaptchaSecretKey: recaptchaSecretKey.trim() || undefined,
        similarPropertiesLimit,
      });
      toast({ title: 'Widget settings saved', description: 'Search options have been updated.' });
    } catch (err) {
      toast({ title: 'Failed to save widget settings', description: (err as Error).message || 'Unexpected error', variant: 'destructive' });
    } finally {
      setSavingWidget(false);
    }
  };

  const onSaveInquiry = async () => {
    setSavingInquiry(true);
    try {
      await apiPut('/api/dashboard/tenant/settings', {
        inquiryNotificationEmails,
        inquiryWebhookUrl: inquiryWebhookUrl.trim() || undefined,
        inquiryAutoReplyEnabled,
      });
      toast({ title: 'Inquiry settings saved', description: 'Notification and webhook settings have been updated.' });
    } catch (err) {
      toast({ title: 'Failed to save inquiry settings', description: (err as Error).message || 'Unexpected error', variant: 'destructive' });
    } finally {
      setSavingInquiry(false);
    }
  };

  const addInquiryEmail = () => {
    const email = inquiryEmailInput.trim().toLowerCase();
    if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      toast({ title: 'Invalid email', description: 'Please enter a valid email address.', variant: 'destructive' });
      return;
    }
    if (inquiryNotificationEmails.includes(email)) {
      toast({ title: 'Already added', description: 'This email is already in the list.', variant: 'destructive' });
      return;
    }
    setInquiryNotificationEmails([...inquiryNotificationEmails, email]);
    setInquiryEmailInput('');
  };

  const removeInquiryEmail = (email: string) => {
    setInquiryNotificationEmails(inquiryNotificationEmails.filter(e => e !== email));
  };

  const generalForm = useForm({
    resolver: zodResolver(generalSchema),
    defaultValues: {
      companyName: '',
      domain: '',
      defaultLanguage: 'en',
    },
  });

  const emailForm = useForm({
    resolver: zodResolver(emailSchema),
    defaultValues: {
      smtpHost: '',
      smtpPort: 587,
      smtpUser: '',
      smtpPassword: '',
      fromEmail: '',
      fromName: '',
    },
  });

  const onGeneralSubmit = async (data: z.infer<typeof generalSchema>) => {
    setSavingGeneral(true);
    try {
      await apiPut('/api/dashboard/tenant/settings', {
        companyName: data.companyName,
        defaultLanguage: data.defaultLanguage,
        slugFormat,
        languages: enabledLanguages,
      });
      toast({
        title: 'Settings saved',
        description: 'Your general settings have been updated.',
      });
    } catch (error) {
      toast({
        title: 'Error',
        description: 'Failed to save settings.',
        variant: 'destructive',
      });
    } finally {
      setSavingGeneral(false);
    }
  };

  const onEmailSubmit = async (data: z.infer<typeof emailSchema>) => {
    setSavingEmail(true);
    try {
      await apiPut('/api/dashboard/email-config', {
        provider: 'smtp',
        smtpHost: data.smtpHost || undefined,
        smtpPort: data.smtpPort || 587,
        smtpUser: data.smtpUser || undefined,
        smtpPassword: data.smtpPassword || undefined,
        fromEmail: data.fromEmail || undefined,
        fromName: data.fromName || undefined,
      });
      setEmailTestResult(null);
      toast({
        title: 'Email settings saved',
        description: 'Your SMTP configuration has been updated.',
      });
    } catch (error) {
      toast({
        title: 'Error',
        description: (error as Error).message || 'Failed to save email settings.',
        variant: 'destructive',
      });
    } finally {
      setSavingEmail(false);
    }
  };

  const onTestEmail = async () => {
    setTestingEmail(true);
    setEmailTestResult(null);
    try {
      const res = await apiPost<{ success: boolean; error?: string }>(
        '/api/dashboard/email-config/test',
      );
      setEmailTestResult(res);
    } catch (err) {
      setEmailTestResult({ success: false, error: (err as Error).message || 'Connection test failed' });
    } finally {
      setTestingEmail(false);
    }
  };

  const onRotateApiKey = async () => {
    const confirmed = window.confirm(
      'Regenerate your API key? The current key will stop working immediately. You must update your widget and any integrations with the new key.',
    );
    if (!confirmed) return;
    setRotatingApiKey(true);
    try {
      const res = await apiPost<{ apiKey: string; apiKeyLast4: string }>(
        '/api/dashboard/tenant/api-key/rotate',
      );
      setRevealedApiKey(res.apiKey);
      setApiKeyLast4(res.apiKeyLast4);
      toast({
        title: 'API key regenerated',
        description: 'Copy the new key now — it will not be shown again.',
      });
    } catch (err) {
      toast({
        title: 'Failed to regenerate API key',
        description: (err as Error).message || 'Unexpected error',
        variant: 'destructive',
      });
    } finally {
      setRotatingApiKey(false);
    }
  };

  return (
    <div className="space-y-6 animate-fade-in">
      {/* Header */}
      <div className="page-header">
        <div>
          <h1 className="page-title">Settings</h1>
          <p className="page-description mt-1">
            Manage your account and application settings
          </p>
        </div>
      </div>

      <Tabs defaultValue="general" className="space-y-6">
        <TabsList>
          <TabsTrigger value="general">
            <Building2 className="h-4 w-4 mr-2" />
            General
          </TabsTrigger>
          <TabsTrigger value="widget">
            <LayoutGrid className="h-4 w-4 mr-2" />
            Widget
          </TabsTrigger>
          <TabsTrigger value="email">
            <Mail className="h-4 w-4 mr-2" />
            Email
          </TabsTrigger>
          {/* Webhook tab hidden — only used internally for WP plugin sync, configured by support team */}
          {webhookUrl && (
            <TabsTrigger value="webhooks">
              <Webhook className="h-4 w-4 mr-2" />
              Webhooks
            </TabsTrigger>
          )}
          {/* AI tab hidden — OpenRouter key/model is infrastructure, managed by super admin */}
          {aiChatEnabled && (
            <TabsTrigger value="ai-chat">
              <MessageSquare className="h-4 w-4 mr-2" />
              AI Chat
            </TabsTrigger>
          )}
          <TabsTrigger value="cache">
            <RefreshCw className="h-4 w-4 mr-2" />
            Cache
          </TabsTrigger>
        </TabsList>

        {/* General Settings */}
        <TabsContent value="general">
          <Card>
            <CardHeader>
              <CardTitle>General Settings</CardTitle>
              <CardDescription>
                Configure your company information and preferences
              </CardDescription>
            </CardHeader>
            <CardContent>
              <form
                onSubmit={generalForm.handleSubmit(onGeneralSubmit)}
                className="space-y-6"
              >
                <div className="grid gap-4 md:grid-cols-2">
                  <div className="space-y-2">
                    <Label htmlFor="companyName">Company Name</Label>
                    <Input
                      id="companyName"
                      {...generalForm.register('companyName')}
                    />
                    {generalForm.formState.errors.companyName && (
                      <p className="text-sm text-destructive">
                        {generalForm.formState.errors.companyName.message}
                      </p>
                    )}
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="domain">Website Domain</Label>
                    <Input
                      id="domain"
                      placeholder="yourdomain.com"
                      {...generalForm.register('domain')}
                    />
                  </div>
                </div>
                <div className="grid gap-4 md:grid-cols-2">
                  <div className="space-y-2">
                    <Label htmlFor="defaultLanguage">Default Language</Label>
                    <select
                      id="defaultLanguage"
                      className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
                      {...generalForm.register('defaultLanguage')}
                    >
                      {enabledLanguages.map(code => (
                        <option key={code} value={code}>{ALL_LANGUAGES[code] || code.toUpperCase()}</option>
                      ))}
                    </select>
                  </div>
                  <div className="space-y-2">
                    <Label>Property Slug Format</Label>
                    <Select value={slugFormat} onValueChange={(v) => setSlugFormat(v as SlugFormat)}>
                      <SelectTrigger><SelectValue /></SelectTrigger>
                      <SelectContent>
                        {SLUG_FORMAT_OPTIONS.map((opt) => (
                          <SelectItem key={opt.value} value={opt.value}>
                            {opt.label}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                    <p className="text-xs text-muted-foreground">
                      Default URL format for property detail pages. Individual properties can override this with a custom slug.
                    </p>
                    {SLUG_FORMAT_OPTIONS.find((o) => o.value === slugFormat) && (
                      <p className="text-xs text-muted-foreground">
                        Example: <code className="bg-muted rounded px-1">{SLUG_FORMAT_OPTIONS.find((o) => o.value === slugFormat)!.example}</code>
                      </p>
                    )}
                  </div>
                </div>
                <Button type="submit" disabled={savingGeneral}>
                  {savingGeneral ? 'Saving...' : 'Save Changes'}
                </Button>
              </form>
            </CardContent>
          </Card>

          <Card className="mt-4">
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Languages className="h-5 w-5" />
                Languages
              </CardTitle>
              <CardDescription>
                Languages enabled here apply across property types, features, labels, and property translations.
                English is always enabled as the base language.
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="flex flex-wrap gap-2">
                {enabledLanguages.map(code => (
                  <span key={code} className="inline-flex items-center gap-1 rounded-md border px-2.5 py-1 text-sm font-medium">
                    {ALL_LANGUAGES[code] || code.toUpperCase()}
                    {code !== 'en' && (
                      <button
                        type="button"
                        className="ml-1 rounded-sm hover:bg-muted p-0.5"
                        disabled={savingLangs}
                        onClick={async () => {
                          const updated = enabledLanguages.filter(l => l !== code);
                          setEnabledLanguages(updated);
                          setSavingLangs(true);
                          try {
                            await apiPut('/api/dashboard/tenant/settings', { languages: updated });
                            toast({ title: `Removed ${ALL_LANGUAGES[code] || code}` });
                          } catch {
                            setEnabledLanguages(enabledLanguages);
                            toast({ title: 'Failed to remove language', variant: 'destructive' });
                          } finally {
                            setSavingLangs(false);
                          }
                        }}
                      >
                        <X className="h-3 w-3" />
                      </button>
                    )}
                  </span>
                ))}
              </div>
              {Object.keys(ALL_LANGUAGES).filter(c => !enabledLanguages.includes(c)).length > 0 && (
                <div className="flex items-center gap-2">
                  <Select
                    onValueChange={async (code) => {
                      if (!code || enabledLanguages.includes(code)) return;
                      const updated = [...enabledLanguages, code];
                      setEnabledLanguages(updated);
                      setSavingLangs(true);
                      try {
                        await apiPut('/api/dashboard/tenant/settings', { languages: updated });
                        toast({ title: `Added ${ALL_LANGUAGES[code] || code}` });
                      } catch {
                        setEnabledLanguages(enabledLanguages);
                        toast({ title: 'Failed to add language', variant: 'destructive' });
                      } finally {
                        setSavingLangs(false);
                      }
                    }}
                  >
                    <SelectTrigger className="w-[220px]">
                      <SelectValue placeholder="Add a language..." />
                    </SelectTrigger>
                    <SelectContent>
                      {Object.entries(ALL_LANGUAGES)
                        .filter(([code]) => !enabledLanguages.includes(code))
                        .map(([code, name]) => (
                          <SelectItem key={code} value={code}>{name}</SelectItem>
                        ))}
                    </SelectContent>
                  </Select>
                  {savingLangs && <RefreshCw className="h-4 w-4 animate-spin text-muted-foreground" />}
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        {/* Widget Settings */}
        <TabsContent value="widget">
          <Card>
            <CardHeader>
              <CardTitle>Search Widget Options</CardTitle>
              <CardDescription>
                Configure the bedroom, bathroom, and price options shown in
                the search widget dropdowns and button groups.
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-6">
              <div className="space-y-4">
                <div className="space-y-2">
                  <Label>Listing Types</Label>
                  <p className="text-xs text-muted-foreground">
                    Select which listing types are available in the search widget. At least one must be enabled.
                  </p>
                  <div className="flex flex-wrap gap-4">
                    {[
                      { value: 'sale', label: 'Sale' },
                      { value: 'rent', label: 'Long-term Rent' },
                      { value: 'holiday_rent', label: 'Holiday Rent' },
                      { value: 'development', label: 'Development' },
                    ].map(({ value, label }) => (
                      <label key={value} className="flex items-center gap-2 cursor-pointer">
                        <input
                          type="checkbox"
                          checked={enabledListingTypes.includes(value)}
                          onChange={(e) => {
                            if (e.target.checked) {
                              setEnabledListingTypes([...enabledListingTypes, value]);
                            } else if (enabledListingTypes.length > 1) {
                              setEnabledListingTypes(enabledListingTypes.filter(v => v !== value));
                            }
                          }}
                          className="h-4 w-4 rounded border-gray-300"
                        />
                        <span className="text-sm">{label}</span>
                      </label>
                    ))}
                  </div>
                </div>

                <div className="space-y-2">
                  <Label>Wishlist / Favorites Icon</Label>
                  <p className="text-xs text-muted-foreground">
                    Choose the icon used for saving properties across the widget (listing cards, detail page, wishlist).
                  </p>
                  <div className="flex gap-2">
                    {([
                      { value: 'heart' as const, icon: Heart, label: 'Heart' },
                      { value: 'star' as const, icon: Star, label: 'Star' },
                      { value: 'bookmark' as const, icon: Bookmark, label: 'Bookmark' },
                      { value: 'save' as const, icon: Save, label: 'Save' },
                    ]).map(({ value, icon: Icon, label }) => (
                      <button
                        key={value}
                        type="button"
                        className={`flex items-center gap-2 rounded-md border px-4 py-2 text-sm font-medium transition-colors ${wishlistIcon === value ? 'border-primary bg-primary/10 text-primary' : 'border-input hover:bg-muted'}`}
                        onClick={() => setWishlistIcon(value)}
                      >
                        <Icon className="h-4 w-4" />
                        {label}
                      </button>
                    ))}
                  </div>
                </div>

                <div className="space-y-2">
                  <Label>Property Detail Map Display</Label>
                  <p className="text-xs text-muted-foreground">
                    How the property location is shown on the detail page map. &quot;Auto&quot; uses the best available data.
                  </p>
                  <div className="flex flex-wrap gap-2">
                    {([
                      { value: 'auto' as const, label: 'Auto (Best Available)', desc: 'Pin → Zip → Location' },
                      { value: '0' as const, label: 'Pin + Circle', desc: 'Approximate marker with radius' },
                      { value: '1' as const, label: 'Zip Code Area', desc: 'Boundary around postal code' },
                      { value: '2' as const, label: 'Location Area', desc: 'Boundary around municipality' },
                    ]).map(({ value, label, desc }) => (
                      <button
                        key={value}
                        type="button"
                        className={`flex flex-col items-start rounded-md border px-4 py-2 text-sm transition-colors ${mapVariation === value ? 'border-primary bg-primary/10 text-primary' : 'border-input hover:bg-muted'}`}
                        onClick={() => setMapVariation(value)}
                      >
                        <span className="font-medium">{label}</span>
                        <span className="text-xs text-muted-foreground">{desc}</span>
                      </button>
                    ))}
                  </div>
                </div>

                <div className="space-y-2">
                  <Label>Similar Properties</Label>
                  <p className="text-xs text-muted-foreground">
                    Number of similar properties shown on the property detail page. Set to 0 to hide the section entirely.
                  </p>
                  <Input
                    type="number"
                    min={0}
                    max={20}
                    value={similarPropertiesLimit}
                    onChange={(e) => setSimilarPropertiesLimit(Number(e.target.value))}
                    className="w-28"
                  />
                </div>

                <div className="space-y-2">
                  <Label>Bedroom Options</Label>
                  <p className="text-xs text-muted-foreground">
                    Values shown in the bedrooms dropdown/buttons. Each value means &quot;X or more&quot;.
                  </p>
                  <div className="flex flex-wrap gap-2">
                    {bedroomOptions.map((n) => (
                      <span
                        key={n}
                        className="inline-flex items-center gap-1 rounded-md border px-2.5 py-1 text-sm font-medium"
                      >
                        {n}+
                        <button
                          type="button"
                          className="ml-1 rounded-sm hover:bg-muted p-0.5"
                          onClick={() =>
                            setBedroomOptions(bedroomOptions.filter((v) => v !== n))
                          }
                        >
                          <X className="h-3 w-3" />
                        </button>
                      </span>
                    ))}
                  </div>
                  <div className="flex items-center gap-2">
                    <Input
                      type="number"
                      min={1}
                      max={20}
                      placeholder="Add value"
                      className="w-28"
                      onKeyDown={(e) => {
                        if (e.key === 'Enter') {
                          e.preventDefault();
                          const val = Number((e.target as HTMLInputElement).value);
                          if (val > 0 && !bedroomOptions.includes(val)) {
                            setBedroomOptions([...bedroomOptions, val].sort((a, b) => a - b));
                            (e.target as HTMLInputElement).value = '';
                          }
                        }
                      }}
                    />
                    <p className="text-xs text-muted-foreground">Press Enter to add</p>
                  </div>
                </div>

                <div className="space-y-2">
                  <Label>Bathroom Options</Label>
                  <p className="text-xs text-muted-foreground">
                    Values shown in the bathrooms dropdown/buttons. Each value means &quot;X or more&quot;.
                  </p>
                  <div className="flex flex-wrap gap-2">
                    {bathroomOptions.map((n) => (
                      <span
                        key={n}
                        className="inline-flex items-center gap-1 rounded-md border px-2.5 py-1 text-sm font-medium"
                      >
                        {n}+
                        <button
                          type="button"
                          className="ml-1 rounded-sm hover:bg-muted p-0.5"
                          onClick={() =>
                            setBathroomOptions(bathroomOptions.filter((v) => v !== n))
                          }
                        >
                          <X className="h-3 w-3" />
                        </button>
                      </span>
                    ))}
                  </div>
                  <div className="flex items-center gap-2">
                    <Input
                      type="number"
                      min={1}
                      max={20}
                      placeholder="Add value"
                      className="w-28"
                      onKeyDown={(e) => {
                        if (e.key === 'Enter') {
                          e.preventDefault();
                          const val = Number((e.target as HTMLInputElement).value);
                          if (val > 0 && !bathroomOptions.includes(val)) {
                            setBathroomOptions([...bathroomOptions, val].sort((a, b) => a - b));
                            (e.target as HTMLInputElement).value = '';
                          }
                        }
                      }}
                    />
                    <p className="text-xs text-muted-foreground">Press Enter to add</p>
                  </div>
                </div>
              </div>

              <div className="space-y-3">
                  <Label>Price Dropdown Options</Label>
                  <p className="text-xs text-muted-foreground">
                    Configure price dropdown values per listing type. The widget automatically shows the right prices based on the selected listing type.
                  </p>
                  {[
                    { key: 'sale', label: 'Sale' },
                    { key: 'rent', label: 'Long-term Rent' },
                    { key: 'holiday_rent', label: 'Holiday Rent' },
                  ].map(({ key, label }) => {
                    const values = priceOptions[key] || [];
                    return (
                      <div key={key} className="rounded-md border p-3 space-y-2">
                        <p className="text-sm font-medium">{label}</p>
                        <div className="flex flex-wrap gap-2">
                          {values.map((n) => (
                            <span
                              key={n}
                              className="inline-flex items-center gap-1 rounded-md border px-2.5 py-1 text-xs font-medium"
                            >
                              {n.toLocaleString()}
                              <button
                                type="button"
                                className="ml-1 rounded-sm hover:bg-muted p-0.5"
                                onClick={() =>
                                  setPriceOptions({
                                    ...priceOptions,
                                    [key]: values.filter((v) => v !== n),
                                  })
                                }
                              >
                                <X className="h-3 w-3" />
                              </button>
                            </span>
                          ))}
                        </div>
                        <div className="flex items-center gap-2">
                          <Input
                            type="number"
                            min={1}
                            placeholder="Add price"
                            className="w-36 h-8 text-sm"
                            onKeyDown={(e) => {
                              if (e.key === 'Enter') {
                                e.preventDefault();
                                const val = Number((e.target as HTMLInputElement).value);
                                if (val > 0 && !values.includes(val)) {
                                  setPriceOptions({
                                    ...priceOptions,
                                    [key]: [...values, val].sort((a, b) => a - b),
                                  });
                                  (e.target as HTMLInputElement).value = '';
                                }
                              }
                            }}
                          />
                          <p className="text-xs text-muted-foreground">Press Enter to add</p>
                        </div>
                      </div>
                    );
                  })}
                </div>

              <Button onClick={onSaveWidget} disabled={savingWidget}>
                {savingWidget ? 'Saving...' : 'Save Widget Settings'}
              </Button>
            </CardContent>
          </Card>

          <Card className="mt-4">
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Palette className="h-5 w-5" />
                Theme Color
              </CardTitle>
              <CardDescription>
                Set a primary color for your widget. All buttons, links, and accents will follow this color.
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="flex items-center gap-4">
                <input
                  type="color"
                  value={primaryColor}
                  onChange={(e) => setPrimaryColor(e.target.value)}
                  className="h-10 w-14 cursor-pointer rounded border border-input p-0.5"
                />
                <Input
                  value={primaryColor}
                  onChange={(e) => {
                    const v = e.target.value;
                    if (/^#[0-9a-fA-F]{0,6}$/.test(v)) setPrimaryColor(v);
                  }}
                  className="w-32 font-mono"
                  maxLength={7}
                  placeholder="#2563eb"
                />
                <div
                  className="h-10 flex-1 rounded-md flex items-center justify-center text-white text-sm font-medium"
                  style={{ backgroundColor: primaryColor }}
                >
                  Preview
                </div>
              </div>
              <div className="flex gap-2">
                {['#2563eb', '#c8a255', '#16a34a', '#dc2626', '#7c3aed', '#0891b2', '#ea580c', '#1e293b'].map(color => (
                  <button
                    key={color}
                    type="button"
                    className={`h-8 w-8 rounded-full border-2 transition-transform hover:scale-110 ${primaryColor === color ? 'border-foreground scale-110' : 'border-transparent'}`}
                    style={{ backgroundColor: color }}
                    onClick={() => setPrimaryColor(color)}
                  />
                ))}
              </div>
              <Button onClick={onSaveWidget} disabled={savingWidget} size="sm">
                {savingWidget ? 'Saving...' : 'Save Theme'}
              </Button>
            </CardContent>
          </Card>

          <Card className="mt-4">
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <ShieldCheck className="h-5 w-5" />
                reCAPTCHA
              </CardTitle>
              <CardDescription>
                Protect your inquiry form from spam with Google reCAPTCHA v2.
                When both keys are set, a reCAPTCHA checkbox appears above the
                &quot;Send Inquiry&quot; button on property detail pages.
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="grid gap-4 md:grid-cols-2">
                <div className="space-y-2">
                  <Label htmlFor="recaptchaSiteKey">Site Key</Label>
                  <Input
                    id="recaptchaSiteKey"
                    placeholder="6Lc..."
                    value={recaptchaSiteKey}
                    onChange={(e) => setRecaptchaSiteKey(e.target.value)}
                    className="font-mono text-sm"
                  />
                  <p className="text-xs text-muted-foreground">
                    The public key embedded in the widget HTML.
                  </p>
                </div>
                <div className="space-y-2">
                  <Label htmlFor="recaptchaSecretKey">Secret Key</Label>
                  <Input
                    id="recaptchaSecretKey"
                    type="password"
                    placeholder="6Lc..."
                    value={recaptchaSecretKey}
                    onChange={(e) => setRecaptchaSecretKey(e.target.value)}
                    className="font-mono text-sm"
                  />
                  <p className="text-xs text-muted-foreground">
                    The private key used for server-side verification.
                  </p>
                </div>
              </div>
              <p className="text-xs text-muted-foreground">
                Get your keys from{' '}
                <a
                  href="https://www.google.com/recaptcha/admin"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="underline"
                >
                  google.com/recaptcha/admin
                </a>
                . Choose reCAPTCHA v2 &quot;I&apos;m not a robot&quot; checkbox.
                Leave both fields empty to disable reCAPTCHA.
              </p>
              <Button onClick={onSaveWidget} disabled={savingWidget} size="sm">
                {savingWidget ? 'Saving...' : 'Save reCAPTCHA'}
              </Button>
            </CardContent>
          </Card>
        </TabsContent>

        {/* Email Settings */}
        <TabsContent value="email">
          <Card>
            <CardHeader>
              <CardTitle>Email Configuration</CardTitle>
              <CardDescription>
                Configure your SMTP settings for sending email campaigns
              </CardDescription>
            </CardHeader>
            <CardContent>
              <form
                onSubmit={emailForm.handleSubmit(onEmailSubmit)}
                className="space-y-6"
              >
                <div className="grid gap-4 md:grid-cols-2">
                  <div className="space-y-2">
                    <Label htmlFor="smtpHost">SMTP Host</Label>
                    <Input
                      id="smtpHost"
                      placeholder="smtp.yourprovider.com"
                      {...emailForm.register('smtpHost')}
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="smtpPort">SMTP Port</Label>
                    <Input
                      id="smtpPort"
                      type="number"
                      placeholder="587"
                      {...emailForm.register('smtpPort')}
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="smtpUser">SMTP Username</Label>
                    <Input
                      id="smtpUser"
                      {...emailForm.register('smtpUser')}
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="smtpPassword">SMTP Password</Label>
                    <Input
                      id="smtpPassword"
                      type="password"
                      {...emailForm.register('smtpPassword')}
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="fromEmail">From Email</Label>
                    <Input
                      id="fromEmail"
                      type="email"
                      placeholder="noreply@yourdomain.com"
                      {...emailForm.register('fromEmail')}
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="fromName">From Name</Label>
                    <Input
                      id="fromName"
                      placeholder="Your Company"
                      {...emailForm.register('fromName')}
                    />
                  </div>
                </div>
                <div className="flex gap-2">
                  <Button type="submit" disabled={savingEmail}>
                    {savingEmail ? 'Saving...' : 'Save Settings'}
                  </Button>
                  <Button
                    type="button"
                    variant="outline"
                    onClick={onTestEmail}
                    disabled={testingEmail}
                  >
                    <Mail className={`h-4 w-4 mr-2 ${testingEmail ? 'animate-pulse' : ''}`} />
                    {testingEmail ? 'Testing...' : 'Send Test Email'}
                  </Button>
                </div>
                {emailTestResult && (
                  <div
                    className={
                      'rounded-lg border p-4 mt-4 ' +
                      (emailTestResult.success
                        ? 'border-primary/20 bg-secondary/20'
                        : 'border-primary/10 bg-muted')
                    }
                  >
                    {emailTestResult.success ? (
                      <p className="text-sm text-primary">
                        SMTP connection test successful! A test email was sent.
                      </p>
                    ) : (
                      <p className="text-sm text-primary/70">
                        Connection failed: {emailTestResult.error}
                      </p>
                    )}
                  </div>
                )}
              </form>
            </CardContent>
          </Card>

          <Card className="mt-4">
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Mail className="h-5 w-5" />
                Inquiry Notifications
              </CardTitle>
              <CardDescription>
                Configure where inquiry form submissions are sent. Add email
                recipients and/or a webhook URL to connect with Zapier, HubSpot,
                Make, or any third-party tool.
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-6">
              <div className="space-y-3">
                <Label>Notification Recipients</Label>
                <p className="text-xs text-muted-foreground">
                  All emails listed below will receive a notification when someone
                  submits an inquiry on your website.
                </p>
                <div className="flex gap-2">
                  <Input
                    placeholder="email@example.com"
                    value={inquiryEmailInput}
                    onChange={(e) => setInquiryEmailInput(e.target.value)}
                    onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); addInquiryEmail(); } }}
                    className="flex-1"
                  />
                  <Button type="button" variant="outline" size="icon" onClick={addInquiryEmail}>
                    <Plus className="h-4 w-4" />
                  </Button>
                </div>
                {inquiryNotificationEmails.length > 0 && (
                  <div className="flex flex-wrap gap-2">
                    {inquiryNotificationEmails.map(email => (
                      <span key={email} className="inline-flex items-center gap-1 rounded-full bg-secondary px-3 py-1 text-sm">
                        {email}
                        <button type="button" onClick={() => removeInquiryEmail(email)} className="ml-1 hover:text-destructive">
                          <X className="h-3 w-3" />
                        </button>
                      </span>
                    ))}
                  </div>
                )}
              </div>

              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <Label htmlFor="autoReply">Auto-reply to Inquirer</Label>
                  <Switch
                    id="autoReply"
                    checked={inquiryAutoReplyEnabled}
                    onCheckedChange={setInquiryAutoReplyEnabled}
                  />
                </div>
                <p className="text-xs text-muted-foreground">
                  When enabled, the person who submitted the inquiry receives a
                  confirmation email that their message was received.
                </p>
              </div>

              <div className="space-y-2">
                <Label htmlFor="inquiryWebhook">Inquiry Webhook URL</Label>
                <Input
                  id="inquiryWebhook"
                  placeholder="https://hooks.zapier.com/hooks/catch/..."
                  value={inquiryWebhookUrl}
                  onChange={(e) => setInquiryWebhookUrl(e.target.value)}
                  className="font-mono text-sm"
                />
                <p className="text-xs text-muted-foreground">
                  Every inquiry will be POSTed as JSON to this URL. Works with
                  Zapier, HubSpot, Make, n8n, or any webhook receiver. The payload
                  includes: name, email, phone, message, propertyId, and timestamp.
                </p>
              </div>

              <Button onClick={onSaveInquiry} disabled={savingInquiry} size="sm">
                {savingInquiry ? 'Saving...' : 'Save Inquiry Settings'}
              </Button>
            </CardContent>
          </Card>

          {/* 5R — sender-domain verification. Lives in the same tab as
              SMTP config because they're conceptually paired (provider
              credentials + which domain we sign as). The card branches
              between "configure" and "show records + verify" modes
              off the single GET response. */}
          <Card className="mt-4">
            <CardHeader>
              <CardTitle>Sender Domain (SPF / DKIM / DMARC)</CardTitle>
              <CardDescription>
                Publish three DNS records on the domain you want mail to
                come from. Until they verify, deliverability falls back to
                the system default sender — and some receivers (Gmail)
                will reject unsigned mail outright.
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              {!senderDomainLoaded ? (
                <p className="text-sm text-muted-foreground">Loading\u2026</p>
              ) : (
                <>
                  <div className="flex gap-2 items-end">
                    <div className="flex-1 space-y-2">
                      <Label htmlFor="senderDomain">Domain</Label>
                      <Input
                        id="senderDomain"
                        placeholder="mail.yourdomain.com"
                        value={senderDomainInput}
                        onChange={(e) => setSenderDomainInput(e.target.value)}
                      />
                    </div>
                    <Button
                      onClick={onSaveSenderDomain}
                      disabled={savingSenderDomain || !senderDomainInput.trim()}
                    >
                      {savingSenderDomain ? 'Saving\u2026' : 'Save'}
                    </Button>
                    {senderDomain && (
                      <Button
                        variant="outline"
                        onClick={onRemoveSenderDomain}
                      >
                        Remove
                      </Button>
                    )}
                  </div>

                  {senderDomain && (
                    <>
                      <div className="flex items-center gap-3">
                        <span
                          className={
                            'text-xs font-medium rounded px-2 py-1 ' +
                            (senderDomain.status === 'verified'
                              ? 'bg-secondary text-primary'
                              : senderDomain.status === 'partial'
                              ? 'bg-secondary/60 text-primary/80'
                              : 'bg-muted text-muted-foreground')
                          }
                        >
                          {senderDomain.status === 'verified'
                            ? 'All records verified'
                            : senderDomain.status === 'partial'
                            ? 'Partially verified'
                            : 'Not yet verified'}
                        </span>
                        <Button
                          size="sm"
                          variant="outline"
                          onClick={onVerifySenderDomain}
                          disabled={verifyingSenderDomain}
                        >
                          <RefreshCw
                            className={`mr-2 h-3 w-3 ${
                              verifyingSenderDomain ? 'animate-spin' : ''
                            }`}
                          />
                          {verifyingSenderDomain
                            ? 'Checking\u2026'
                            : 'Verify DNS'}
                        </Button>
                      </div>

                      {/* One sub-card per record; tenant copies host +
                          value into their DNS host. We show the latest
                          verifiedAt so they can see when it last passed
                          a check (null = never). */}
                      <div className="space-y-3">
                        {(
                          [
                            {
                              key: 'spf' as const,
                              label: 'SPF',
                              verifiedAt: senderDomain.spfVerifiedAt,
                            },
                            {
                              key: 'dkim' as const,
                              label: 'DKIM',
                              verifiedAt: senderDomain.dkimVerifiedAt,
                            },
                            {
                              key: 'dmarc' as const,
                              label: 'DMARC',
                              verifiedAt: senderDomain.dmarcVerifiedAt,
                            },
                          ] as const
                        ).map(({ key, label, verifiedAt }) => (
                          <div
                            key={key}
                            className="rounded-lg border p-3 space-y-2"
                          >
                            <div className="flex items-center justify-between">
                              <span className="font-medium">{label}</span>
                              <span
                                className={
                                  'text-xs ' +
                                  (verifiedAt
                                    ? 'text-primary'
                                    : 'text-muted-foreground')
                                }
                              >
                                {verifiedAt
                                  ? `Verified ${new Date(
                                      verifiedAt,
                                    ).toLocaleString()}`
                                  : 'Not verified yet'}
                              </span>
                            </div>
                            <div className="text-xs space-y-1">
                              <div>
                                <span className="text-muted-foreground">
                                  Host:{' '}
                                </span>
                                <code className="bg-muted rounded px-1">
                                  {senderDomain.records[key].host}
                                </code>
                              </div>
                              <div>
                                <span className="text-muted-foreground">
                                  Type:{' '}
                                </span>
                                <code className="bg-muted rounded px-1">
                                  {senderDomain.records[key].type}
                                </code>
                              </div>
                              <div>
                                <span className="text-muted-foreground">
                                  Value:{' '}
                                </span>
                                <code className="bg-muted rounded px-1 break-all">
                                  {senderDomain.records[key].value}
                                </code>
                              </div>
                            </div>
                          </div>
                        ))}
                      </div>
                    </>
                  )}
                </>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        {/* API Keys tab hidden — not needed by clients yet */}

        {/* Webhooks */}
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

        {/* AI / OpenRouter */}
        {/* AI tab content hidden — OpenRouter config is managed by super admin */}

        {/* AI Chat */}
        <TabsContent value="ai-chat" className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle>AI Chat Widget</CardTitle>
              <CardDescription>
                Configure the AI-powered chat assistant on your website. Visitors can search properties,
                ask questions, compare listings, and get recommendations through natural conversation.
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-6">
              <div className="flex items-center justify-between rounded-lg border p-4">
                <div>
                  <p className="font-medium">Enable AI Chat</p>
                  <p className="text-sm text-muted-foreground">
                    Show the chat bubble on your website widget
                  </p>
                </div>
                <Switch checked={aiChatEnabled} onCheckedChange={setAiChatEnabled} />
              </div>

              {aiChatEnabled && (
                <>
                  <div className="space-y-4">
                    <h4 className="text-sm font-medium">Feature Toggles</h4>
                    <p className="text-xs text-muted-foreground">
                      Enable or disable individual AI capabilities. Disabling a feature removes the
                      corresponding tools from the AI, so it won&apos;t attempt those actions.
                    </p>

                    <div className="space-y-3">
                      <div className="flex items-center justify-between">
                        <div>
                          <p className="text-sm font-medium">Natural Language Search</p>
                          <p className="text-xs text-muted-foreground">&ldquo;3 bedroom villa under 400k&rdquo; → property results</p>
                        </div>
                        <Switch checked={aiChatNLSearch} onCheckedChange={setAiChatNLSearch} />
                      </div>

                      <div className="flex items-center justify-between">
                        <div>
                          <p className="text-sm font-medium">Conversational Memory</p>
                          <p className="text-xs text-muted-foreground">Multi-turn context — &ldquo;show apartments&rdquo; then &ldquo;any with pool?&rdquo;</p>
                        </div>
                        <Switch checked={aiChatConversational} onCheckedChange={setAiChatConversational} />
                      </div>

                      <div className="flex items-center justify-between">
                        <div>
                          <p className="text-sm font-medium">Property Q&amp;A</p>
                          <p className="text-xs text-muted-foreground">Answer questions about a specific property&apos;s details</p>
                        </div>
                        <Switch checked={aiChatPropertyQA} onCheckedChange={setAiChatPropertyQA} />
                      </div>

                      <div className="flex items-center justify-between">
                        <div>
                          <p className="text-sm font-medium">Property Comparison</p>
                          <p className="text-xs text-muted-foreground">Side-by-side comparison of two or more properties</p>
                        </div>
                        <Switch checked={aiChatComparison} onCheckedChange={setAiChatComparison} />
                      </div>

                      <div className="flex items-center justify-between">
                        <div>
                          <p className="text-sm font-medium">Recommendations</p>
                          <p className="text-xs text-muted-foreground">&ldquo;Find something like this but cheaper&rdquo;</p>
                        </div>
                        <Switch checked={aiChatRecommendations} onCheckedChange={setAiChatRecommendations} />
                      </div>

                      <div className="flex items-center justify-between">
                        <div>
                          <p className="text-sm font-medium">Multilingual</p>
                          <p className="text-xs text-muted-foreground">Respond in the visitor&apos;s language automatically</p>
                        </div>
                        <Switch checked={aiChatMultilingual} onCheckedChange={setAiChatMultilingual} />
                      </div>
                    </div>
                  </div>

                  <div className="space-y-4 border-t pt-4">
                    <h4 className="text-sm font-medium">Configuration</h4>

                    <div className="space-y-2">
                      <Label htmlFor="aiChatWelcome">Welcome Message</Label>
                      <Textarea
                        id="aiChatWelcome"
                        placeholder="Hello! I can help you find your perfect property. What are you looking for?"
                        value={aiChatWelcomeMessage}
                        onChange={(e) => setAiChatWelcomeMessage(e.target.value)}
                        rows={2}
                      />
                      <p className="text-xs text-muted-foreground">
                        Greeting shown when a visitor opens the chat. Leave blank for no greeting.
                      </p>
                    </div>

                    <div className="grid gap-4 md:grid-cols-2">
                      <div className="space-y-2">
                        <Label htmlFor="aiChatMaxMsg">Max Messages per Conversation</Label>
                        <Input
                          id="aiChatMaxMsg"
                          type="number"
                          min={5}
                          max={200}
                          value={aiChatMaxMessages}
                          onChange={(e) => setAiChatMaxMessages(Number(e.target.value))}
                        />
                        <p className="text-xs text-muted-foreground">
                          After this limit, the visitor must start a new chat.
                        </p>
                      </div>

                      <div className="space-y-2">
                        <Label htmlFor="aiChatTTL">Conversation Expiry (days)</Label>
                        <Input
                          id="aiChatTTL"
                          type="number"
                          min={1}
                          max={90}
                          value={aiChatTTLDays}
                          onChange={(e) => setAiChatTTLDays(Number(e.target.value))}
                        />
                        <p className="text-xs text-muted-foreground">
                          Returning visitors get a new chat after this many days.
                        </p>
                      </div>
                    </div>

                    <div className="flex items-center justify-between rounded-lg border p-4">
                      <div>
                        <p className="font-medium">Auto-email Admin</p>
                        <p className="text-sm text-muted-foreground">
                          Automatically email you the chat transcript when a visitor sends 3+ messages
                        </p>
                      </div>
                      <Switch checked={aiChatAutoEmailAdmin} onCheckedChange={setAiChatAutoEmailAdmin} />
                    </div>
                  </div>
                </>
              )}

              <Button onClick={onSaveAiChat} disabled={savingAiChat}>
                {savingAiChat ? 'Saving…' : 'Save AI Chat Settings'}
              </Button>
            </CardContent>
          </Card>
        </TabsContent>

        {/* Widget Cache */}
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
      </Tabs>
    </div>
  );
}
