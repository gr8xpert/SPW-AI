'use client';

import {
  useDashboardAddons,
  type DashboardAddonKey,
} from '@/hooks/use-dashboard-addons';
import { LockedRouteScreen } from '@/components/locked-route-screen';

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
  if (isLoading) return null;
  if (isError) {
    return (
      <div className="rounded-md border p-6 text-sm text-muted-foreground">
        Could not check your plan.{' '}
        <button type="button" className="underline" onClick={retry}>Try again</button>
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
