'use client';

import { useDashboardAddons } from './use-dashboard-addons';
import { useToast } from './use-toast';

// Client-side gate for the AI translation add-on. Server enforces the same
// gate via @RequiresAddon('aiTranslation') on TranslationController, but
// checking here surfaces the lock as a friendly toast instead of a 403 and
// lets buttons render greyed with a tooltip.
export function useAiTranslationGuard() {
  const { addons, isLoading } = useDashboardAddons();
  const { toast } = useToast();
  const locked = !isLoading && !addons.aiTranslation;

  const check = (): boolean => {
    if (isLoading) return false;
    if (!addons.aiTranslation) {
      toast({
        title: 'AI Translation is a premium feature',
        description: 'This add-on is locked for your account. Contact your account manager to unlock it.',
        variant: 'destructive',
      });
      return false;
    }
    return true;
  };

  return { locked, isLoading, check };
}
