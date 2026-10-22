'use client';

import { useState } from 'react';
import { useToast } from '@/hooks/use-toast';
import { apiGet, apiPost, apiPut } from '@/lib/api';
import { useLanguage } from '@/i18n/i18n-provider';
import type { AiModelOption, TenantCurrent } from './types';
import { useSettingsText } from '../_i18n';

// State for the AI (OpenRouter key + model) and AI Chat tabs. `aiChatEnabled`
// also decides whether the page shows the AI Chat tab.
export function useAiSettings() {
  const { toast } = useToast();
  const st = useSettingsText();
  const t = st.ai;
  const { locale } = useLanguage();
  const money = (n: number) => n.toLocaleString(locale, { minimumFractionDigits: 2, maximumFractionDigits: 2 });

  // AI / OpenRouter state
  const [aiApiKey, setAiApiKey] = useState('');
  const [aiApiKeyMasked, setAiApiKeyMasked] = useState('');
  const [aiModel, setAiModel] = useState('');
  const [savingAi, setSavingAi] = useState(false);
  const [testingAi, setTestingAi] = useState(false);
  const [aiTestResult, setAiTestResult] = useState<{ ok: boolean; model?: string; requested?: string; retired?: boolean; error?: string } | null>(null);
  // Current models from the API (checked against OpenRouter's live list), and
  // whether the saved one still exists.
  const [aiModels, setAiModels] = useState<AiModelOption[]>([]);
  const [aiModelStatus, setAiModelStatus] = useState<{ saved: string | null; savedAvailable: boolean; effective: string } | null>(null);

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

  const priceText = (m: AiModelOption) =>
    m.inputPrice != null && m.outputPrice != null
      ? t.price(money(m.inputPrice), money(m.outputPrice))
      : '';
  const aiModelLabel = (id: string) => aiModels.find((m) => m.id === id)?.label || id;

  // Fills both tabs from GET /api/dashboard/tenant (called by the page
  // loader), then loads the live model list.
  const applyTenant = (res: TenantCurrent) => {
    const settings = res.data?.settings;
    // Secrets are no longer returned in settings; the API exposes top-level
    // *Configured booleans on the tenant payload instead. Set masked
    // placeholders so the UI continues to render a "configured" state, and
    // the save handler (which skips masked values) won't overwrite.
    const tenantData = res.data as unknown as { openRouterApiKeyConfigured?: boolean };
    if (tenantData.openRouterApiKeyConfigured) {
      setAiApiKeyMasked('••••••••••••');
    }
    if (settings?.openRouterModel) {
      setAiModel(settings.openRouterModel);
    }
    apiGet<{ data: { models: AiModelOption[]; saved: string | null; savedAvailable: boolean; effective: string } }>('/api/dashboard/ai/models')
      .then((r) => {
        const body = r.data;
        setAiModels(body.models || []);
        setAiModelStatus({ saved: body.saved, savedAvailable: body.savedAvailable, effective: body.effective });
        // Nothing saved yet: preselect the recommended model.
        if (!body.saved && body.models?.length) setAiModel(body.models[0].id);
      })
      .catch(() => {
        /* the dropdown still shows the saved model */
      });
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
  };

  const onSaveAi = async () => {
    setSavingAi(true);
    try {
      const payload: Record<string, string> = { openRouterModel: aiModel };
      if (aiApiKey.trim() && !aiApiKey.trim().startsWith('sk-or-')) {
        toast({ title: t.notOpenRouterKey, description: t.notOpenRouterKeyText, variant: 'destructive' });
        return;
      }
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
      // The model just saved is one from the live list, so the retired warning goes.
      setAiModelStatus((prev) => ({
        saved: aiModel,
        savedAvailable: aiModels.some((m) => m.id === aiModel) || (prev?.saved === aiModel ? prev.savedAvailable : true),
        effective: aiModel,
      }));
      toast({ title: t.saved, description: t.savedText });
    } catch (err) {
      toast({ title: t.saveFailed, description: (err as Error).message || st.common.unexpectedError, variant: 'destructive' });
    } finally {
      setSavingAi(false);
    }
  };

  // An empty key clears the stored one; with no key the website stops
  // offering AI search.
  const onRemoveAiKey = async () => {
    if (!confirm(t.removeConfirm)) return;
    setSavingAi(true);
    try {
      await apiPut('/api/dashboard/tenant/settings', { openRouterApiKey: '' });
      setAiApiKeyMasked('');
      setAiApiKey('');
      setAiTestResult(null);
      toast({ title: t.removed, description: t.removedText });
    } catch (err) {
      toast({ title: t.removeFailed, description: (err as Error).message || st.common.unexpectedError, variant: 'destructive' });
    } finally {
      setSavingAi(false);
    }
  };

  const onTestAi = async () => {
    setTestingAi(true);
    setAiTestResult(null);
    try {
      // Tests the model picked in the dropdown, even before it is saved.
      const res = await apiPost<{ data: { ok: boolean; model: string; requested?: string; retired?: boolean; error?: string } }>(
        '/api/dashboard/translate/test',
        aiModel ? { model: aiModel } : {},
      );
      setAiTestResult(res.data);
    } catch (err) {
      setAiTestResult({ ok: false, error: (err as Error).message || st.email.testFailedDefault });
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
      toast({ title: st.aiChat.saved, description: st.aiChat.savedText });
    } catch (err) {
      toast({ title: st.aiChat.saveFailed, description: (err as Error).message || st.common.unexpectedError, variant: 'destructive' });
    } finally {
      setSavingAiChat(false);
    }
  };

  return {
    aiApiKey,
    setAiApiKey,
    aiApiKeyMasked,
    aiModel,
    setAiModel,
    savingAi,
    testingAi,
    aiTestResult,
    aiModels,
    aiModelStatus,
    priceText,
    aiModelLabel,
    onSaveAi,
    onRemoveAiKey,
    onTestAi,
    aiChatEnabled,
    setAiChatEnabled,
    aiChatNLSearch,
    setAiChatNLSearch,
    aiChatConversational,
    setAiChatConversational,
    aiChatPropertyQA,
    setAiChatPropertyQA,
    aiChatComparison,
    setAiChatComparison,
    aiChatRecommendations,
    setAiChatRecommendations,
    aiChatMultilingual,
    setAiChatMultilingual,
    aiChatWelcomeMessage,
    setAiChatWelcomeMessage,
    aiChatMaxMessages,
    setAiChatMaxMessages,
    aiChatTTLDays,
    setAiChatTTLDays,
    aiChatAutoEmailAdmin,
    setAiChatAutoEmailAdmin,
    savingAiChat,
    onSaveAiChat,
    applyTenant,
  };
}

export type AiSettings = ReturnType<typeof useAiSettings>;
