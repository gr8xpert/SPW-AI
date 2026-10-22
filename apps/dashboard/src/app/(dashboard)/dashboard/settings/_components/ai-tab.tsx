'use client';

import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from '@/components/ui/card';
import { TabsContent } from '@/components/ui/tabs';
import type { AiSettings } from './use-ai-settings';
import type { AiProvider } from './types';
import { useSettingsText } from '../_i18n';

const SELECT_CLASS = 'flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm';

export function AiTab({ ai }: { ai: AiSettings }) {
  const {
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
    aiProvider,
    setAiProvider,
    anthropicKey,
    setAnthropicKey,
    anthropicKeyMasked,
    anthropicModel,
    setAnthropicModel,
    anthropicModels,
  } = ai;
  const st = useSettingsText();
  const t = st.ai;
  const onAnthropic = aiProvider === 'anthropic';

  // The OpenRouter key field: the main key on OpenRouter, the optional voice
  // key on Anthropic.
  const openRouterKeyField = (label: string, help: string) => (
    <div className="space-y-2">
      <Label htmlFor="ai-api-key">{label}</Label>
      {aiApiKeyMasked && (
        <p className="text-sm text-muted-foreground">
          {t.currentKey} <code>{aiApiKeyMasked}</code>
        </p>
      )}
      <Input
        id="ai-api-key"
        type="password"
        // Without this the browser fills in the dashboard login
        // password, and one Save stores it as the AI key — which
        // switches AI search on for the website with a key that
        // can never work.
        autoComplete="new-password"
        placeholder={aiApiKeyMasked ? t.replacePlaceholder : 'sk-or-...'}
        value={aiApiKey}
        onChange={(e) => setAiApiKey(e.target.value)}
      />
      <p className="text-xs text-muted-foreground">
        {t.getKey}{' '}
        <a href="https://openrouter.ai/keys" target="_blank" rel="noopener noreferrer" className="underline">
          openrouter.ai/keys
        </a>
      </p>
      <p className="text-xs text-muted-foreground">{help}</p>
    </div>
  );

  return (
    <TabsContent value="ai" className="space-y-4">
      <Card>
        <CardHeader>
          <CardTitle>{t.title}</CardTitle>
          <CardDescription>{t.description}</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="ai-provider">{t.provider}</Label>
            <select
              id="ai-provider"
              className={SELECT_CLASS}
              value={aiProvider}
              onChange={(e) => setAiProvider(e.target.value as AiProvider)}
            >
              <option value="openrouter">{t.providerOpenRouter}</option>
              <option value="anthropic">{t.providerAnthropic}</option>
            </select>
            <p className="text-xs text-muted-foreground">{t.providerHelp}</p>
          </div>

          {onAnthropic ? (
            <>
              <div className="space-y-2">
                <Label htmlFor="ai-anthropic-key">{t.anthropicKey}</Label>
                {anthropicKeyMasked && (
                  <p className="text-sm text-muted-foreground">
                    {t.currentKey} <code>{anthropicKeyMasked}</code>
                  </p>
                )}
                <Input
                  id="ai-anthropic-key"
                  type="password"
                  autoComplete="new-password"
                  placeholder={anthropicKeyMasked ? t.replacePlaceholder : 'sk-ant-...'}
                  value={anthropicKey}
                  onChange={(e) => setAnthropicKey(e.target.value)}
                />
                <p className="text-xs text-muted-foreground">
                  {t.getKey}{' '}
                  <a href="https://console.anthropic.com/settings/keys" target="_blank" rel="noopener noreferrer" className="underline">
                    console.anthropic.com
                  </a>
                </p>
                <p className="text-xs text-muted-foreground">{t.keyHelp}</p>
              </div>

              <div className="space-y-2">
                <Label htmlFor="ai-anthropic-model">{t.model}</Label>
                <select
                  id="ai-anthropic-model"
                  className={SELECT_CLASS}
                  value={anthropicModel}
                  onChange={(e) => setAnthropicModel(e.target.value)}
                >
                  {anthropicModels.map((m) => (
                    <option key={m.id} value={m.id}>
                      {m.label}
                      {priceText(m)}
                    </option>
                  ))}
                </select>
                {anthropicModels.find((m) => m.id === anthropicModel)?.note && (
                  <p className="text-xs text-muted-foreground">{anthropicModels.find((m) => m.id === anthropicModel)?.note}</p>
                )}
              </div>

              <div className="rounded-md border p-3">{openRouterKeyField(t.voiceKey, t.voiceKeyHelp)}</div>
            </>
          ) : (
            <>
              {openRouterKeyField(t.apiKey, t.keyHelp)}

              <div className="space-y-2">
                <Label htmlFor="ai-model">{t.model}</Label>
                <select
                  id="ai-model"
                  className={SELECT_CLASS}
                  value={aiModel}
                  onChange={(e) => setAiModel(e.target.value)}
                >
                  {aiModel && !aiModels.some((m) => m.id === aiModel) && (
                    <option value={aiModel}>
                      {aiModel}
                      {aiModelStatus?.saved === aiModel && !aiModelStatus.savedAvailable ? ` ${t.noLongerAvailable}` : ''}
                    </option>
                  )}
                  {aiModels.map((m) => (
                    <option key={m.id} value={m.id}>
                      {m.label}
                      {priceText(m)}
                    </option>
                  ))}
                </select>
                {aiModels.find((m) => m.id === aiModel)?.note && (
                  <p className="text-xs text-muted-foreground">{aiModels.find((m) => m.id === aiModel)?.note}</p>
                )}
              </div>

              {aiModelStatus?.saved && !aiModelStatus.savedAvailable && (
                <div className="rounded-md border border-amber-300 bg-amber-50 p-3 text-sm text-amber-900 dark:border-amber-700 dark:bg-amber-950 dark:text-amber-200" data-testid="ai-model-retired">
                  {t.retiredBefore} <code>{aiModelStatus.saved}</code> {t.retiredMiddle}{' '}
                  <strong>{aiModelLabel(aiModelStatus.effective)}</strong> {t.retiredAfter}
                </div>
              )}
            </>
          )}

          {aiTestResult && (
            <div className={`rounded-md p-3 text-sm ${aiTestResult.ok ? 'bg-green-50 text-green-800 dark:bg-green-950 dark:text-green-200' : 'bg-red-50 text-red-800 dark:bg-red-950 dark:text-red-200'}`}>
              {aiTestResult.ok
                ? t.connected(aiModelLabel(aiTestResult.model || ''))
                : st.common.connectionFailed(aiTestResult.error ?? '')}
              {aiTestResult.retired && aiTestResult.requested && (
                <p className="mt-1 text-xs">
                  {t.retiredTest(aiTestResult.requested, aiModelLabel(aiTestResult.model || ''))}
                </p>
              )}
            </div>
          )}
        </CardContent>
        <CardFooter className="flex gap-2">
          <Button onClick={onSaveAi} disabled={savingAi}>
            {savingAi ? st.common.saving : st.common.save}
          </Button>
          <Button variant="outline" onClick={onTestAi} disabled={testingAi}>
            {testingAi ? st.common.testing : t.test}
          </Button>
          {(onAnthropic ? anthropicKeyMasked : aiApiKeyMasked) && (
            <Button variant="ghost" className="ml-auto text-destructive" onClick={onRemoveAiKey} disabled={savingAi}>
              {t.removeKey}
            </Button>
          )}
        </CardFooter>
      </Card>
    </TabsContent>
  );
}
