'use client';

import { CalendarClock, Loader2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { useToast } from '@/hooks/use-toast';
import { useCalendarText } from '../../_i18n/calendar';
import { useBookingLink } from '../../use-calendar';

// The lead's prefilled Calendly link on the clipboard, to paste in an
// email or chat.
export function CopyBookingLink({ leadId }: { leadId: number }) {
  const c = useCalendarText();
  const { toast } = useToast();
  const link = useBookingLink();
  const copy = () =>
    link.mutate(leadId, {
      onSuccess: async ({ url }) => {
        try {
          await navigator.clipboard.writeText(url);
          toast({ title: c.bookingCopied });
        } catch {
          window.prompt(c.copyBooking, url);
        }
      },
      onError: (e) => toast({ title: c.failed, description: e.message, variant: 'destructive' }),
    });
  return (
    <Button size="sm" variant="ghost" className="h-8 w-8 p-0" onClick={copy} disabled={link.isPending} title={c.copyBooking} aria-label={c.copyBooking} data-testid="row-booking-link">
      {link.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <CalendarClock className="h-4 w-4" />}
    </Button>
  );
}
