'use client';

import Link from 'next/link';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Lock, Sparkles, Mail } from 'lucide-react';
import { useCommonText } from '@/i18n/common';

interface LockedFeatureDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  featureName: string;
  description?: string;
  // When present, the dialog frames the lock as a tier upgrade prompt
  // ("upgrade to Tier 2") rather than a per-feature add-on unlock.
  // requiredTier is the minimum tier that grants access to this feature.
  requiredTier?: 2 | 3;
}

// Shown when the tenant clicks a locked sidebar item or action button.
// Single shared component so every lock prompt has the same copy + CTA.
// Behaves in one of two modes:
//   - requiredTier set → upsell to a tier (Tier 2 or Tier 3)
//   - requiredTier absent → per-feature add-on unlock (legacy behavior)
export function LockedFeatureDialog({
  open,
  onOpenChange,
  featureName,
  description,
  requiredTier,
}: LockedFeatureDialogProps) {
  const t = useCommonText().lockedDialog;
  const tierCopy = requiredTier === 2 ? t.tier2 : requiredTier === 3 ? t.tier3 : null;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <div className="mb-2 inline-flex h-10 w-10 items-center justify-center rounded-full bg-primary/10">
            <Lock className="h-5 w-5 text-primary" />
          </div>
          <DialogTitle>
            {requiredTier ? t.upgradeTitle(featureName) : t.addonTitle(featureName)}
          </DialogTitle>
          <DialogDescription>
            {description ?? tierCopy ?? t.addonText(featureName)}
          </DialogDescription>
        </DialogHeader>
        <DialogFooter className="gap-2 sm:gap-2">
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            {t.later}
          </Button>
          {/* Tier upgrades aren't self-serve — super-admin handles them
              per request. Route this CTA to a mailto so the client can
              start the conversation immediately. Non-tier (add-on) locks
              still route to /dashboard/billing for now, which is where
              account-manager contact info lives. */}
          {requiredTier ? (
            <Button asChild onClick={() => onOpenChange(false)}>
              <a
                href={`mailto:webmaster@realtysoft.eu?subject=${encodeURIComponent(
                  `Upgrade request: Tier ${requiredTier} — ${featureName}`,
                )}`}
              >
                <Mail className="mr-2 h-4 w-4" />
                {t.contact}
              </a>
            </Button>
          ) : (
            <Button asChild onClick={() => onOpenChange(false)}>
              <Link href="/dashboard/billing">
                <Sparkles className="mr-2 h-4 w-4" />
                {t.viewPlans}
              </Link>
            </Button>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
