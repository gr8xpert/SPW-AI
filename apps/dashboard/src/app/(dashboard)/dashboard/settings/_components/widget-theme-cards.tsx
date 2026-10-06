'use client';

import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Palette, ShieldCheck } from 'lucide-react';
import type { WidgetSettings } from './use-widget-settings';

// Theme Color + reCAPTCHA cards of the Widget tab. Both save through
// onSaveWidget, i.e. the same payload as the search options card.
export function WidgetThemeCards({ widget }: { widget: WidgetSettings }) {
  const {
    primaryColor,
    setPrimaryColor,
    recaptchaSiteKey,
    setRecaptchaSiteKey,
    recaptchaSecretKey,
    setRecaptchaSecretKey,
    savingWidget,
    onSaveWidget,
  } = widget;

  return (
    <>
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
                // Never the browser's saved login (10-06: an email address and
                // password were auto-filled here and blocked every inquiry).
                autoComplete="off"
                name="spm-recaptcha-site"
                data-1p-ignore
                data-lpignore="true"
                spellCheck={false}
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
                // Text masked by CSS, not type="password": password managers
                // fill any password field with the saved login.
                type="text"
                autoComplete="off"
                name="spm-recaptcha-secret"
                data-1p-ignore
                data-lpignore="true"
                spellCheck={false}
                placeholder="6Lc..."
                value={recaptchaSecretKey}
                onChange={(e) => setRecaptchaSecretKey(e.target.value)}
                className="font-mono text-sm"
                style={{ WebkitTextSecurity: 'disc' } as React.CSSProperties}
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
    </>
  );
}
