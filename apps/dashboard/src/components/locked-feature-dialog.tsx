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
import { Lock, Sparkles } from 'lucide-react';

interface LockedFeatureDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  featureName: string;
  description?: string;
}

// Shown when the tenant clicks a locked sidebar item or action button.
// Single shared component so every lock prompt has the same copy + CTA.
export function LockedFeatureDialog({
  open,
  onOpenChange,
  featureName,
  description,
}: LockedFeatureDialogProps) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <div className="mb-2 inline-flex h-10 w-10 items-center justify-center rounded-full bg-primary/10">
            <Lock className="h-5 w-5 text-primary" />
          </div>
          <DialogTitle>{featureName} is a paid add-on</DialogTitle>
          <DialogDescription>
            {description ??
              `Unlock ${featureName} to add it to your dashboard. Contact your account manager to upgrade your subscription.`}
          </DialogDescription>
        </DialogHeader>
        <DialogFooter className="gap-2 sm:gap-2">
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Maybe later
          </Button>
          <Button asChild>
            <Link href="/dashboard/billing">
              <Sparkles className="mr-2 h-4 w-4" />
              View plans
            </Link>
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
