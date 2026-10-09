'use client';

import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from '@/components/ui/card';
import { TabsContent } from '@/components/ui/tabs';
import { Save } from 'lucide-react';
import type { AiSettings } from './use-ai-settings';

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
  } = ai;

  return (
    <TabsContent value="ai" className="space-y-4">
      <Card>
        <CardHeader>
          <CardTitle>AI Translation</CardTitle>
          <CardDescription>
            Configure AI-powered label translation via OpenRouter. This key is used when translating
            property labels and descriptions into other languages.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="ai-api-key">OpenRouter API Key</Label>
            {aiApiKeyMasked && (
              <p className="text-sm text-muted-foreground">
                Current key: <code>{aiApiKeyMasked}</code>
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
              placeholder={aiApiKeyMasked ? 'Enter new key to replace' : 'sk-or-...'}
              value={aiApiKey}
              onChange={(e) => setAiApiKey(e.target.value)}
            />
            <p className="text-xs text-muted-foreground">
              Get your key from{' '}
              <a href="https://openrouter.ai/keys" target="_blank" rel="noopener noreferrer" className="underline">
                openrouter.ai/keys
              </a>
            </p>
            <p className="text-xs text-muted-foreground">
              Your key is needed for property AI: SEO, Bulk SEO, property translations, AI search and the chatbot.
              Once added, it is also used for translating and organizing locations, types, features and labels.
            </p>
          </div>

          <div className="space-y-2">
            <Label htmlFor="ai-model">Model</Label>
            <select
              id="ai-model"
              className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
              value={aiModel}
              onChange={(e) => setAiModel(e.target.value)}
            >
              {aiModel && !aiModels.some((m) => m.id === aiModel) && (
                <option value={aiModel}>
                  {aiModel}
                  {aiModelStatus?.saved === aiModel && !aiModelStatus.savedAvailable ? ' (no longer available)' : ''}
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
              Your saved model <code>{aiModelStatus.saved}</code> is no longer offered by OpenRouter. AI features
              are using <strong>{aiModelLabel(aiModelStatus.effective)}</strong> meanwhile. Choose a model and
              click Save.
            </div>
          )}

          {aiTestResult && (
            <div className={`rounded-md p-3 text-sm ${aiTestResult.ok ? 'bg-green-50 text-green-800 dark:bg-green-950 dark:text-green-200' : 'bg-red-50 text-red-800 dark:bg-red-950 dark:text-red-200'}`}>
              {aiTestResult.ok
                ? `Connected successfully — model: ${aiModelLabel(aiTestResult.model || '')}`
                : `Connection failed: ${aiTestResult.error}`}
              {aiTestResult.retired && aiTestResult.requested && (
                <p className="mt-1 text-xs">
                  {aiTestResult.requested} is no longer available on OpenRouter, so this test used{' '}
                  {aiModelLabel(aiTestResult.model || '')}.
                </p>
              )}
            </div>
          )}
        </CardContent>
        <CardFooter className="flex gap-2">
          <Button onClick={onSaveAi} disabled={savingAi}>
            {savingAi ? 'Saving…' : 'Save'}
          </Button>
          <Button variant="outline" onClick={onTestAi} disabled={testingAi}>
            {testingAi ? 'Testing…' : 'Test Connection'}
          </Button>
          {aiApiKeyMasked && (
            <Button variant="ghost" className="ml-auto text-destructive" onClick={onRemoveAiKey} disabled={savingAi}>
              Remove key
            </Button>
          )}
        </CardFooter>
      </Card>
    </TabsContent>
  );
}
