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
    savingInquiry,
    onSaveInquiry,
    addInquiryEmail,
    removeInquiryEmail,
  } = email;

  return (
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
                  autoComplete="new-password"
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

      <WeeklyReportCard />

      <SenderDomainCard senderDomainSettings={senderDomainSettings} />
    </TabsContent>
  );
}
