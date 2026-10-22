'use client';

import { useEffect, useState } from 'react';
import {
  useDashboardAddons,
  type DashboardAddonKey,
} from '@/hooks/use-dashboard-addons';
import { LockedRouteScreen } from '@/components/locked-route-screen';
import { useSharedText } from '@/i18n/shared';

interface LockedRouteGuardProps {
  addon: DashboardAddonKey;
  featureName: string;
  description?: string;
  children: React.ReactNode;
}

// Wraps a route's content with an addon check. Renders LockedRouteScreen
// instead of children when the tenant hasn't unlocked this addon. Keeps
// the inner component's hook order stable — children only mount when
// unlocked, so its useState/useEffect calls don't change between
// renders the way a top-of-component early-return would.
export function LockedRouteGuard({
  addon,
  featureName,
  description,
  children,
}: LockedRouteGuardProps) {
  const { addons, isLoading, isError, retry } = useDashboardAddons();
  const t = useSharedText().locked;
  // The server always renders nothing here (no session there). The add-on
  // answer can arrive while the page is still hydrating, so the first client
  // render must match that empty output or React reports a hydration error.
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);
  if (!mounted || isLoading) return null;
  if (isError) {
    return (
      <div className="rounded-md border p-6 text-sm text-muted-foreground">
        {t.checkFailed}{' '}
        <button type="button" className="underline" onClick={retry}>{t.tryAgain}</button>
      </div>
    );
  }
  if (!addons[addon]) {
    return (
      <LockedRouteScreen
        featureName={featureName}
        description={description}
      />
    );
  }
  return <>{children}</>;
}
