'use client';

import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { TabsContent } from '@/components/ui/tabs';
import { Switch } from '@/components/ui/switch';
import { Textarea } from '@/components/ui/textarea';
import type { AiSettings } from './use-ai-settings';
import { useSettingsText } from '../_i18n';

export function AiChatTab({ ai }: { ai: AiSettings }) {
  const {
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
  } = ai;
  const st = useSettingsText();
  const t = st.aiChat;
  const f = t.features;

  return (
    <TabsContent value="ai-chat" className="space-y-4">
      <Card>
        <CardHeader>
          <CardTitle>{t.title}</CardTitle>
          <CardDescription>{t.description}</CardDescription>
        </CardHeader>
        <CardContent className="space-y-6">
          <div className="flex items-center justify-between rounded-lg border p-4">
            <div>
              <p className="font-medium">{t.enable}</p>
              <p className="text-sm text-muted-foreground">{t.enableHelp}</p>
            </div>
            <Switch checked={aiChatEnabled} onCheckedChange={setAiChatEnabled} />
          </div>

          {aiChatEnabled && (
            <>
              <div className="space-y-4">
                <h4 className="text-sm font-medium">{t.featureToggles}</h4>
                <p className="text-xs text-muted-foreground">{t.featureHelp}</p>

                <div className="space-y-3">
                  <div className="flex items-center justify-between">
                    <div>
                      <p className="text-sm font-medium">{f.nlSearch.title}</p>
                      <p className="text-xs text-muted-foreground">{f.nlSearch.desc}</p>
                    </div>
                    <Switch checked={aiChatNLSearch} onCheckedChange={setAiChatNLSearch} />
                  </div>

                  <div className="flex items-center justify-between">
                    <div>
                      <p className="text-sm font-medium">{f.memory.title}</p>
                      <p className="text-xs text-muted-foreground">{f.memory.desc}</p>
                    </div>
                    <Switch checked={aiChatConversational} onCheckedChange={setAiChatConversational} />
                  </div>

                  <div className="flex items-center justify-between">
                    <div>
                      <p className="text-sm font-medium">{f.qa.title}</p>
                      <p className="text-xs text-muted-foreground">{f.qa.desc}</p>
                    </div>
                    <Switch checked={aiChatPropertyQA} onCheckedChange={setAiChatPropertyQA} />
                  </div>

                  <div className="flex items-center justify-between">
                    <div>
                      <p className="text-sm font-medium">{f.comparison.title}</p>
                      <p className="text-xs text-muted-foreground">{f.comparison.desc}</p>
                    </div>
                    <Switch checked={aiChatComparison} onCheckedChange={setAiChatComparison} />
                  </div>

                  <div className="flex items-center justify-between">
                    <div>
                      <p className="text-sm font-medium">{f.recommendations.title}</p>
                      <p className="text-xs text-muted-foreground">{f.recommendations.desc}</p>
                    </div>
                    <Switch checked={aiChatRecommendations} onCheckedChange={setAiChatRecommendations} />
                  </div>

                  <div className="flex items-center justify-between">
                    <div>
                      <p className="text-sm font-medium">{f.multilingual.title}</p>
                      <p className="text-xs text-muted-foreground">{f.multilingual.desc}</p>
                    </div>
                    <Switch checked={aiChatMultilingual} onCheckedChange={setAiChatMultilingual} />
                  </div>
                </div>
              </div>

              <div className="space-y-4 border-t pt-4">
                <h4 className="text-sm font-medium">{t.configuration}</h4>

                <div className="space-y-2">
                  <Label htmlFor="aiChatWelcome">{t.welcome}</Label>
                  <Textarea
                    id="aiChatWelcome"
                    placeholder={t.welcomePlaceholder}
                    value={aiChatWelcomeMessage}
                    onChange={(e) => setAiChatWelcomeMessage(e.target.value)}
                    rows={2}
                  />
                  <p className="text-xs text-muted-foreground">
                    {t.welcomeHelp}
                  </p>
                </div>

                <div className="grid gap-4 md:grid-cols-2">
                  <div className="space-y-2">
                    <Label htmlFor="aiChatMaxMsg">{t.maxMessages}</Label>
                    <Input
                      id="aiChatMaxMsg"
                      type="number"
                      min={5}
                      max={200}
                      value={aiChatMaxMessages}
                      onChange={(e) => setAiChatMaxMessages(Number(e.target.value))}
                    />
                    <p className="text-xs text-muted-foreground">
                      {t.maxMessagesHelp}
                    </p>
                  </div>

                  <div className="space-y-2">
                    <Label htmlFor="aiChatTTL">{t.expiry}</Label>
                    <Input
                      id="aiChatTTL"
                      type="number"
                      min={1}
                      max={90}
                      value={aiChatTTLDays}
                      onChange={(e) => setAiChatTTLDays(Number(e.target.value))}
                    />
                    <p className="text-xs text-muted-foreground">
                      {t.expiryHelp}
                    </p>
                  </div>
                </div>

                <div className="flex items-center justify-between rounded-lg border p-4">
                  <div>
                    <p className="font-medium">{t.autoEmail}</p>
                    <p className="text-sm text-muted-foreground">{t.autoEmailHelp}</p>
                  </div>
                  <Switch checked={aiChatAutoEmailAdmin} onCheckedChange={setAiChatAutoEmailAdmin} />
                </div>
              </div>
            </>
          )}

          <Button onClick={onSaveAiChat} disabled={savingAiChat}>
            {savingAiChat ? st.common.saving : t.save}
          </Button>
        </CardContent>
      </Card>
    </TabsContent>
  );
}
