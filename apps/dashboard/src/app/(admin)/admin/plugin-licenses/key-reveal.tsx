'use client';

import { useState } from 'react';
import { Check, Copy, KeyRound } from 'lucide-react';
import { Button } from '@/components/ui/button';

// The raw key is returned once, right after it is issued or replaced. Only its hash is stored,
// so this is the one moment it can be copied.
export function KeyReveal({ licenseKey, email, emailed }: { licenseKey: string; email: string; emailed: boolean }) {
  const [copied, setCopied] = useState(false);

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(licenseKey);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      setCopied(false);
    }
  };

  return (
    <div className="rounded-lg border border-primary/30 bg-primary/5 p-4 space-y-3">
      <div className="flex items-center gap-2 text-sm font-medium">
        <KeyRound className="h-4 w-4 text-primary" />
        Licence key
      </div>
      <div className="flex flex-wrap items-center gap-2">
        <code className="rounded-md bg-background px-3 py-2 font-mono text-base tracking-wide select-all break-all">{licenseKey}</code>
        <Button type="button" size="sm" variant="outline" onClick={copy}>
          {copied ? <Check className="mr-1.5 h-4 w-4" /> : <Copy className="mr-1.5 h-4 w-4" />}
          {copied ? 'Copied' : 'Copy'}
        </Button>
      </div>
      <p className="text-xs text-muted-foreground">
        {emailed ? `Also emailed to ${email}. ` : 'Not emailed: send it to the client yourself. '}
        Copy it now. It is shown only once; after closing this, only the last 4 characters can be seen.
      </p>
    </div>
  );
}
