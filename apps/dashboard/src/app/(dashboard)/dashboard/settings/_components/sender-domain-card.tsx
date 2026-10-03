'use client';

import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { RefreshCw } from 'lucide-react';
import type { SenderDomainSettings } from './use-sender-domain';

// 5R — sender-domain verification. Lives in the same tab as SMTP config
// because they're conceptually paired (provider credentials + which domain
// we sign as). The card branches between "configure" and "show records +
// verify" modes off the single GET response.
export function SenderDomainCard({ senderDomainSettings }: { senderDomainSettings: SenderDomainSettings }) {
  const {
    senderDomain,
    senderDomainLoaded,
    senderDomainInput,
    setSenderDomainInput,
    savingSenderDomain,
    verifyingSenderDomain,
    onSaveSenderDomain,
    onVerifySenderDomain,
    onRemoveSenderDomain,
  } = senderDomainSettings;

  return (
    <Card className="mt-4">
      <CardHeader>
        <CardTitle>Sender Domain (SPF / DKIM / DMARC)</CardTitle>
        <CardDescription>
          Publish three DNS records on the domain you want mail to
          come from. Until they verify, deliverability falls back to
          the system default sender — and some receivers (Gmail)
          will reject unsigned mail outright.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        {!senderDomainLoaded ? (
          <p className="text-sm text-muted-foreground">Loading\u2026</p>
        ) : (
          <>
            <div className="flex gap-2 items-end">
              <div className="flex-1 space-y-2">
                <Label htmlFor="senderDomain">Domain</Label>
                <Input
                  id="senderDomain"
                  placeholder="mail.yourdomain.com"
                  value={senderDomainInput}
                  onChange={(e) => setSenderDomainInput(e.target.value)}
                />
              </div>
              <Button
                onClick={onSaveSenderDomain}
                disabled={savingSenderDomain || !senderDomainInput.trim()}
              >
                {savingSenderDomain ? 'Saving\u2026' : 'Save'}
              </Button>
              {senderDomain && (
                <Button
                  variant="outline"
                  onClick={onRemoveSenderDomain}
                >
                  Remove
                </Button>
              )}
            </div>

            {senderDomain && (
              <>
                <div className="flex items-center gap-3">
                  <span
                    className={
                      'text-xs font-medium rounded px-2 py-1 ' +
                      (senderDomain.status === 'verified'
                        ? 'bg-secondary text-primary'
                        : senderDomain.status === 'partial'
                        ? 'bg-secondary/60 text-primary/80'
                        : 'bg-muted text-muted-foreground')
                    }
                  >
                    {senderDomain.status === 'verified'
                      ? 'All records verified'
                      : senderDomain.status === 'partial'
                      ? 'Partially verified'
                      : 'Not yet verified'}
                  </span>
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={onVerifySenderDomain}
                    disabled={verifyingSenderDomain}
                  >
                    <RefreshCw
                      className={`mr-2 h-3 w-3 ${
                        verifyingSenderDomain ? 'animate-spin' : ''
                      }`}
                    />
                    {verifyingSenderDomain
                      ? 'Checking\u2026'
                      : 'Verify DNS'}
                  </Button>
                </div>

                {/* One sub-card per record; tenant copies host +
                    value into their DNS host. We show the latest
                    verifiedAt so they can see when it last passed
                    a check (null = never). */}
                <div className="space-y-3">
                  {(
                    [
                      {
                        key: 'spf' as const,
                        label: 'SPF',
                        verifiedAt: senderDomain.spfVerifiedAt,
                      },
                      {
                        key: 'dkim' as const,
                        label: 'DKIM',
                        verifiedAt: senderDomain.dkimVerifiedAt,
                      },
                      {
                        key: 'dmarc' as const,
                        label: 'DMARC',
                        verifiedAt: senderDomain.dmarcVerifiedAt,
                      },
                    ] as const
                  ).map(({ key, label, verifiedAt }) => (
                    <div
                      key={key}
                      className="rounded-lg border p-3 space-y-2"
                    >
                      <div className="flex items-center justify-between">
                        <span className="font-medium">{label}</span>
                        <span
                          className={
                            'text-xs ' +
                            (verifiedAt
                              ? 'text-primary'
                              : 'text-muted-foreground')
                          }
                        >
                          {verifiedAt
                            ? `Verified ${new Date(
                                verifiedAt,
                              ).toLocaleString()}`
                            : 'Not verified yet'}
                        </span>
                      </div>
                      <div className="text-xs space-y-1">
                        <div>
                          <span className="text-muted-foreground">
                            Host:{' '}
                          </span>
                          <code className="bg-muted rounded px-1">
                            {senderDomain.records[key].host}
                          </code>
                        </div>
                        <div>
                          <span className="text-muted-foreground">
                            Type:{' '}
                          </span>
                          <code className="bg-muted rounded px-1">
                            {senderDomain.records[key].type}
                          </code>
                        </div>
                        <div>
                          <span className="text-muted-foreground">
                            Value:{' '}
                          </span>
                          <code className="bg-muted rounded px-1 break-all">
                            {senderDomain.records[key].value}
                          </code>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              </>
            )}
          </>
        )}
      </CardContent>
    </Card>
  );
}
