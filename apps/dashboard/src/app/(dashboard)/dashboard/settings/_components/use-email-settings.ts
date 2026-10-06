'use client';

import { useEffect, useState } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import * as z from 'zod';
import { useToast } from '@/hooks/use-toast';
import { apiGet, apiPost, apiPut } from '@/lib/api';
import { emailSchema, type TenantCurrent } from './types';

// State for the Email tab's SMTP form and Inquiry Notifications card.
// The SMTP config has its own endpoint, loaded here once the token exists.
export function useEmailSettings(accessToken: string | undefined) {
  const { toast } = useToast();

  // Email config state
  const [savingEmail, setSavingEmail] = useState(false);
  const [testingEmail, setTestingEmail] = useState(false);
  const [emailTestResult, setEmailTestResult] = useState<{ success: boolean; error?: string } | null>(null);

  // Inquiry notifications (stored in tenant settings)
  const [inquiryNotificationEmails, setInquiryNotificationEmails] = useState<string[]>([]);
  const [inquiryEmailInput, setInquiryEmailInput] = useState('');
  const [inquiryWebhookUrl, setInquiryWebhookUrl] = useState('');
  const [inquiryAutoReplyEnabled, setInquiryAutoReplyEnabled] = useState(true);
  // The client's own address on form emails (replies go there).
  const [formSenderEmail, setFormSenderEmail] = useState('');
  const [ownEmailDomain, setOwnEmailDomain] = useState(false);
  const [savingInquiry, setSavingInquiry] = useState(false);

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

  useEffect(() => {
    if (!accessToken) return;
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
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [accessToken]);

  // Fills the inquiry card from GET /api/dashboard/tenant (called by the page loader).
  const applyTenant = (res: TenantCurrent) => {
    const settings = res.data?.settings;
    const tenantData = res.data as unknown as { inquiryWebhookUrlConfigured?: boolean };
    if (Array.isArray(settings?.inquiryNotificationEmails)) setInquiryNotificationEmails(settings.inquiryNotificationEmails);
    if (tenantData.inquiryWebhookUrlConfigured) setInquiryWebhookUrl('••••••••');
    if (typeof settings?.inquiryAutoReplyEnabled === 'boolean') setInquiryAutoReplyEnabled(settings.inquiryAutoReplyEnabled);
    if (typeof settings?.formSenderEmail === 'string') setFormSenderEmail(settings.formSenderEmail);
    setOwnEmailDomain((res.data as unknown as { ownEmailDomain?: boolean }).ownEmailDomain === true);
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

  const onSaveInquiry = async () => {
    const sender = formSenderEmail.trim().toLowerCase();
    if (sender && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(sender)) {
      toast({ title: 'Invalid email', description: 'Enter a valid address for your form emails, or leave it empty.', variant: 'destructive' });
      return;
    }
    setSavingInquiry(true);
    try {
      await apiPut('/api/dashboard/tenant/settings', {
        inquiryNotificationEmails,
        inquiryWebhookUrl: inquiryWebhookUrl.trim() || undefined,
        inquiryAutoReplyEnabled,
        formSenderEmail: sender,
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

  return {
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
    applyTenant,
  };
}

export type EmailSettings = ReturnType<typeof useEmailSettings>;
