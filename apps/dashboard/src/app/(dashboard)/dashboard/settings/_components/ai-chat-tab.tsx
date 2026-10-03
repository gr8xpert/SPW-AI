'use client';

import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { TabsContent } from '@/components/ui/tabs';
import { Switch } from '@/components/ui/switch';
import { Textarea } from '@/components/ui/textarea';
import type { AiSettings } from './use-ai-settings';

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

  return (
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
  );
}
