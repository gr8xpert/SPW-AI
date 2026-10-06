'use client';

import { useState } from 'react';
import { Loader2, Lock, X } from 'lucide-react';
import { Button } from '@/components/ui/button';
import type { useApi } from '@/hooks/use-api';
import type { useToast } from '@/hooks/use-toast';

// Plain names for the feed fields a save can lock.
const LABELS: Record<string, string> = {
  title: 'Title', description: 'Description', price: 'Price', priceOnRequest: 'Price on request',
  currency: 'Currency', bedrooms: 'Bedrooms', bathrooms: 'Bathrooms', buildSize: 'Built size',
  plotSize: 'Plot size', terraceSize: 'Terrace size', gardenSize: 'Garden size', reference: 'Reference',
  agentReference: 'Agency reference', listingType: 'Listing type', propertyTypeId: 'Property type',
  locationId: 'Location', features: 'Features', images: 'Photos', lat: 'Map position', lng: 'Map position',
  postcode: 'Postcode', videoUrl: 'Video', virtualTourUrl: 'Virtual tour', communityFees: 'Community fees',
  ibiFees: 'IBI', basuraTax: 'Rubbish tax', builtYear: 'Year built', energyRating: 'Energy rating',
  status: 'Status', isPublished: 'Published', isFeatured: 'Featured',
};

// Feed listings: fields changed in the dashboard are locked so the feed no
// longer overwrites them. Shows which, and lets the user hand them back.
export function FeedLocksNotice({
  api,
  toast,
  propertyId,
  lockedFields,
  onChange,
}: {
  api: ReturnType<typeof useApi<any>>;
  toast: ReturnType<typeof useToast>['toast'];
  propertyId: number;
  lockedFields: string[];
  onChange: (locked: string[]) => void;
}) {
  const [busy, setBusy] = useState<string | null>(null);
  if (!lockedFields.length) return null;

  const unlock = async (fields: string[], key: string) => {
    setBusy(key);
    try {
      const res = await api.post(`/api/dashboard/properties/${propertyId}/unlock`, { fields });
      const saved = (res?.data ?? res)?.lockedFields;
      onChange(Array.isArray(saved) ? saved : lockedFields.filter((f) => !fields.includes(f)));
      toast({ title: 'Unlocked', description: 'The next feed sync (or Re-sync on Feed Import) updates these fields again.' });
    } catch {
      toast({ title: 'Could not unlock', variant: 'destructive' });
    } finally {
      setBusy(null);
    }
  };

  return (
    <div className="rounded-md border border-amber-300 bg-amber-50 p-4 text-amber-950 dark:border-amber-800 dark:bg-amber-950 dark:text-amber-100">
      <div className="flex items-start justify-between gap-4">
        <div className="flex gap-3">
          <Lock className="h-4 w-4 mt-0.5 shrink-0" />
          <div className="space-y-2">
            <p className="text-sm font-medium">Locked against feed updates</p>
            <p className="text-sm opacity-80">
              These were changed here, so the feed no longer updates them. Unlock a field to let the feed manage it again.
            </p>
            <div className="flex flex-wrap gap-2">
              {lockedFields.map((f) => (
                <span key={f} className="inline-flex items-center gap-1 rounded-full bg-white/70 px-2.5 py-0.5 text-xs font-medium dark:bg-black/30">
                  {LABELS[f] ?? f}
                  <button
                    type="button"
                    aria-label={`Unlock ${LABELS[f] ?? f}`}
                    className="opacity-60 hover:opacity-100 disabled:opacity-30"
                    disabled={!!busy}
                    onClick={() => unlock([f], f)}
                  >
                    {busy === f ? <Loader2 className="h-3 w-3 animate-spin" /> : <X className="h-3 w-3" />}
                  </button>
                </span>
              ))}
            </div>
          </div>
        </div>
        <Button variant="outline" size="sm" disabled={!!busy} onClick={() => unlock(lockedFields, '__all')}>
          {busy === '__all' && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
          Unlock all
        </Button>
      </div>
    </div>
  );
}
