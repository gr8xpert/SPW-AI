'use client';

import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { TabsContent } from '@/components/ui/tabs';
import { Mail, X, Plus } from 'lucide-react';
import { Switch } from '@/components/ui/switch';
import { WeeklyReportCard } from '@/components/settings/weekly-report-card';
import { SenderDomainCard } from './sender-domain-card';
import type { EmailSettings } from './use-email-settings';
import type { SenderDomainSettings } from './use-sender-domain';
import { useSettingsText } from '../_i18n';

export function EmailTab({ email, senderDomainSettings }: { email: EmailSettings; senderDomainSettings: SenderDomainSettings }) {
  const {
    emailForm,
    savingEmail,
    testingEmail,
    emailTestResult,
    onEmailSubmit,
    onTestEmail,
    inquiryNotificationEmails,
    inquiryEmailInput,
    setInquiryEmailInput,
    inquiryWebhookUrl,
    setInquiryWebhookUrl,
    inquiryAutoReplyEnabled,
    setInquiryAutoReplyEnabled,
    formSenderEmail,
    setFormSenderEmail,
    ownEmailDomain,
    savingInquiry,
    onSaveInquiry,
    addInquiryEmail,
    removeInquiryEmail,
  } = email;
  const st = useSettingsText();
  const t = st.email;
  const q = st.inquiry;

  return (
    <TabsContent value="email">
      <Card>
        <CardHeader>
          <CardTitle>{t.title}</CardTitle>
          <CardDescription>{t.description}</CardDescription>
        </CardHeader>
        <CardContent>
          <form
            onSubmit={emailForm.handleSubmit(onEmailSubmit)}
            className="space-y-6"
          >
            <div className="grid gap-4 md:grid-cols-2">
              <div className="space-y-2">
                <Label htmlFor="smtpHost">{t.host}</Label>
                <Input
                  id="smtpHost"
                  placeholder="smtp.yourprovider.com"
                  {...emailForm.register('smtpHost')}
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="smtpPort">{t.port}</Label>
                <Input
                  id="smtpPort"
                  type="number"
                  placeholder="587"
                  {...emailForm.register('smtpPort')}
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="smtpUser">{t.user}</Label>
                <Input
                  id="smtpUser"
                  autoComplete="off"
                  data-1p-ignore
                  data-lpignore="true"
                  {...emailForm.register('smtpUser')}
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="smtpPassword">{t.password}</Label>
                <Input
                  id="smtpPassword"
                  type="password"
                  autoComplete="new-password"
                  {...emailForm.register('smtpPassword')}
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="fromEmail">{t.fromEmail}</Label>
                <Input
                  id="fromEmail"
                  type="email"
                  placeholder="noreply@yourdomain.com"
                  {...emailForm.register('fromEmail')}
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="fromName">{t.fromName}</Label>
                <Input
                  id="fromName"
                  placeholder={t.fromNamePlaceholder}
                  {...emailForm.register('fromName')}
                />
              </div>
            </div>
            <div className="flex gap-2">
              <Button type="submit" disabled={savingEmail}>
                {savingEmail ? st.common.saving : t.save}
              </Button>
              <Button
                type="button"
                variant="outline"
                onClick={onTestEmail}
                disabled={testingEmail}
              >
                <Mail className={`h-4 w-4 mr-2 ${testingEmail ? 'animate-pulse' : ''}`} />
                {testingEmail ? st.common.testing : t.sendTest}
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
                    {t.testOk}
                  </p>
                ) : (
                  <p className="text-sm text-primary/70">
                    {st.common.connectionFailed(emailTestResult.error ?? '')}
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
            {q.title}
          </CardTitle>
          <CardDescription>{q.description}</CardDescription>
        </CardHeader>
        <CardContent className="space-y-6">
          <div className="space-y-2">
            <Label htmlFor="formSenderEmail">{q.senderEmail}</Label>
            <Input
              id="formSenderEmail"
              type="email"
              autoComplete="off"
              data-1p-ignore
              data-lpignore="true"
              placeholder="info@yourdomain.com"
              value={formSenderEmail}
              onChange={(e) => setFormSenderEmail(e.target.value)}
            />
            <p className="text-xs text-muted-foreground">
              {q.senderHelp}{' '}
              {ownEmailDomain ? q.senderOwn : q.senderAsk}
            </p>
          </div>

          <div className="space-y-3">
            <Label>{q.recipients}</Label>
            <p className="text-xs text-muted-foreground">{q.recipientsHelp}</p>
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
              <Label htmlFor="autoReply">{q.autoReply}</Label>
              <Switch
                id="autoReply"
                checked={inquiryAutoReplyEnabled}
                onCheckedChange={setInquiryAutoReplyEnabled}
              />
            </div>
            <p className="text-xs text-muted-foreground">
              {q.autoReplyHelp}
            </p>
          </div>

          <div className="space-y-2">
            <Label htmlFor="inquiryWebhook">{q.webhook}</Label>
            <Input
              id="inquiryWebhook"
              placeholder="https://hooks.zapier.com/hooks/catch/..."
              value={inquiryWebhookUrl}
              onChange={(e) => setInquiryWebhookUrl(e.target.value)}
              className="font-mono text-sm"
            />
            <p className="text-xs text-muted-foreground">
              {q.webhookHelp}
            </p>
          </div>

          <Button onClick={onSaveInquiry} disabled={savingInquiry} size="sm">
            {savingInquiry ? st.common.saving : q.save}
          </Button>
        </CardContent>
      </Card>

      <WeeklyReportCard />

      <SenderDomainCard senderDomainSettings={senderDomainSettings} />
    </TabsContent>
  );
}
