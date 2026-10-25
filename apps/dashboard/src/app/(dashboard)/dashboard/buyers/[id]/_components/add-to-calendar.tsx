'use client';

import { CalendarPlus, Download, ExternalLink } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from '@/components/ui/dropdown-menu';
import { useToast } from '@/hooks/use-toast';
import { useCalendarText } from '../../_i18n/calendar';
import { googleCalendarUrl, useDownloadViewingIcs } from '../../use-calendar';

// A viewing into the agent's own calendar: Google's add-event page, or an
// .ics file for Outlook / Apple Calendar.
export function AddToCalendar({ viewing, title, details }: {
  viewing: { id: number; startsAt: string; durationMin: number; meetingPoint: string | null };
  title: string;
  details?: string | null;
}) {
  const c = useCalendarText();
  const { toast } = useToast();
  const download = useDownloadViewingIcs();
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button size="sm" variant="ghost" className="h-7 px-2" title={c.addToCalendar} aria-label={c.addToCalendar} data-testid="viewing-add-calendar">
          <CalendarPlus className="h-4 w-4" />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end">
        <DropdownMenuItem asChild>
          <a href={googleCalendarUrl({ startsAt: viewing.startsAt, durationMin: viewing.durationMin, title, details, location: viewing.meetingPoint })} target="_blank" rel="noopener noreferrer">
            <ExternalLink className="mr-2 h-4 w-4" />{c.google}
          </a>
        </DropdownMenuItem>
        <DropdownMenuItem onSelect={() => download.mutate(viewing.id, { onError: (e) => toast({ title: c.failed, description: e.message, variant: 'destructive' }) })}>
          <Download className="mr-2 h-4 w-4" />{c.download}
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
