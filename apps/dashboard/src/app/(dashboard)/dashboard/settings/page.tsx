'use client';

import { useEffect } from 'react';
import { useSession } from 'next-auth/react';
import {
  Tabs,
  TabsList,
  TabsTrigger,
} from '@/components/ui/tabs';
import { Building2, Mail, Webhook, Key, RefreshCw, Bot, MessageSquare, LayoutGrid } from 'lucide-react';
import { apiGet } from '@/lib/api';
import type { TenantCurrent } from './_components/types';
import { useGeneralSettings } from './_components/use-general-settings';
import { useWidgetSettings } from './_components/use-widget-settings';
import { useEmailSettings } from './_components/use-email-settings';
import { useSenderDomain } from './_components/use-sender-domain';
import { useWebhookSettings } from './_components/use-webhook-settings';
import { useAiSettings } from './_components/use-ai-settings';
import { useApiKeySettings, useCacheSettings } from './_components/use-api-key-cache';
import { GeneralTab } from './_components/general-tab';
import { WidgetTab } from './_components/widget-tab';
import { EmailTab } from './_components/email-tab';
import { ApiKeysTab } from './_components/api-keys-tab';
import { WebhooksTab } from './_components/webhooks-tab';
import { AiTab } from './_components/ai-tab';
import { AiChatTab } from './_components/ai-chat-tab';
import { CacheTab } from './_components/cache-tab';

// Each tab saves on its own. The state lives here (in one hook per tab) and
// not inside the tab components, because Radix unmounts inactive tabs and
// unsaved edits must survive switching between them.
export default function SettingsPage() {
  const { data: session } = useSession();
  const accessToken = session?.accessToken;

  const general = useGeneralSettings();
  const widget = useWidgetSettings();
  const email = useEmailSettings(accessToken);
  const senderDomain = useSenderDomain(accessToken);
  const webhook = useWebhookSettings(accessToken);
  const ai = useAiSettings();
  const apiKey = useApiKeySettings(accessToken);
  const cache = useCacheSettings();

  // One tenant fetch fills several tabs; each hook copies what it owns.
  useEffect(() => {
    if (!accessToken) return;
    apiGet<TenantCurrent>('/api/dashboard/tenant')
      .then((res) => {
        cache.applyTenant(res);
        general.applyTenant(res);
        ai.applyTenant(res);
        widget.applyTenant(res);
        email.applyTenant(res);
      })
      .catch(() => {});
    // applyTenant only calls state setters / form.setValue, which are stable.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [accessToken]);

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
          <TabsTrigger value="api-keys">
            <Key className="h-4 w-4 mr-2" />
            API Keys
          </TabsTrigger>
          {/* Webhook tab hidden — only used internally for WP plugin sync, configured by support team */}
          {webhook.webhookUrl && (
            <TabsTrigger value="webhooks">
              <Webhook className="h-4 w-4 mr-2" />
              Webhooks
            </TabsTrigger>
          )}
          <TabsTrigger value="ai">
            <Bot className="h-4 w-4 mr-2" />
            AI
          </TabsTrigger>
          {ai.aiChatEnabled && (
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

        <GeneralTab general={general} />
        <WidgetTab widget={widget} />
        <EmailTab email={email} senderDomainSettings={senderDomain} />
        <ApiKeysTab apiKey={apiKey} />
        <WebhooksTab webhook={webhook} />
        <AiTab ai={ai} />
        <AiChatTab ai={ai} />
        <CacheTab cache={cache} />
      </Tabs>
    </div>
  );
}
