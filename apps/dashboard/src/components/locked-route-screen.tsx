'use client';

import Link from 'next/link';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Lock, Sparkles } from 'lucide-react';

interface LockedRouteScreenProps {
  featureName: string;
  description?: string;
}

// Full-page lock for protected routes. Shown when the tenant navigates
// directly to /dashboard/<feature> via URL but hasn't unlocked the
// add-on. Keeps the navigation chrome (sidebar/header) visible so the
// tenant can move elsewhere without a hard reload.
export function LockedRouteScreen({
  featureName,
  description,
}: LockedRouteScreenProps) {
  return (
    <div className="flex min-h-[60vh] items-center justify-center p-6">
      <Card className="w-full max-w-md">
        <CardContent className="flex flex-col items-center gap-4 p-8 text-center">
          <div className="inline-flex h-12 w-12 items-center justify-center rounded-full bg-primary/10">
            <Lock className="h-6 w-6 text-primary" />
          </div>
          <div className="space-y-2">
            <h2 className="text-xl font-semibold">
              {featureName} is locked
            </h2>
            <p className="text-sm text-muted-foreground">
              {description ??
                `${featureName} is available as a paid add-on. Contact your account manager to enable it for this client.`}
            </p>
          </div>
          <div className="flex w-full flex-col gap-2 sm:flex-row sm:justify-center">
            <Button asChild>
              <Link href="/dashboard/billing">
                <Sparkles className="mr-2 h-4 w-4" />
                View plans
              </Link>
            </Button>
            <Button variant="outline" asChild>
              <Link href="/dashboard">Back to dashboard</Link>
            </Button>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
