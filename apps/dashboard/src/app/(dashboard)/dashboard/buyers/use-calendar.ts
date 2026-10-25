'use client';

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useApi } from '@/hooks/use-api';
import { useTenantQueryScope } from '@/hooks/use-tenant-query-scope';
import { buyerKeys, one, type ApiError } from './use-buyers';

// Calendar & Calendly (api /api/dashboard/buyers/calendar-feed, /calendly,
// /viewings/:id/ics, /:id/booking-link).

export interface CalendlyMemberView {
  email: string;
  name: string | null;
  schedulingUrl: string | null;
  agentId: number | null;
  agentName: string | null;
}

export interface CalendlyView {
  connected: boolean;
  ownerEmail: string | null;
  automatic: boolean;
  scope: 'organization' | 'user' | null;
  members: CalendlyMemberView[];
  lastEventAt: string | null;
  lastError: string | null;
  bookings: number;
}

const calendarKeys = {
  feed: (scope: readonly unknown[]) => [...buyerKeys.all, 'calendar-feed', ...scope] as const,
  calendly: (scope: readonly unknown[]) => [...buyerKeys.all, 'calendly', ...scope] as const,
};

export function useCalendarFeed() {
  const api = useApi();
  const { scope, ready } = useTenantQueryScope();
  return useQuery({
    queryKey: calendarKeys.feed(scope),
    queryFn: async () => one<{ url: string }>(await api.get('/api/dashboard/buyers/calendar-feed')),
    enabled: ready && api.isReady,
    staleTime: 10 * 60_000,
  });
}

export function useRotateCalendarFeed() {
  const api = useApi();
  const queryClient = useQueryClient();
  return useMutation<{ url: string }, ApiError, void>({
    mutationFn: async () => one<{ url: string }>(await api.post('/api/dashboard/buyers/calendar-feed/rotate')),
    onSuccess: () => void queryClient.invalidateQueries({ queryKey: [...buyerKeys.all, 'calendar-feed'] }),
  });
}

export function useCalendly(enabled: boolean) {
  const api = useApi();
  const { scope, ready } = useTenantQueryScope();
  return useQuery({
    queryKey: calendarKeys.calendly(scope),
    queryFn: async () => one<CalendlyView>(await api.get('/api/dashboard/buyers/calendly')),
    enabled: ready && api.isReady && enabled,
  });
}

function useCalendlyWrite<TVars>(fn: (api: ReturnType<typeof useApi>, vars: TVars) => Promise<CalendlyView>) {
  const api = useApi();
  const queryClient = useQueryClient();
  return useMutation<CalendlyView, ApiError, TVars>({
    mutationFn: (vars) => fn(api, vars),
    onSuccess: () => void queryClient.invalidateQueries({ queryKey: [...buyerKeys.all, 'calendly'] }),
  });
}

export const useConnectCalendly = () =>
  useCalendlyWrite(async (api, token: string) => one<CalendlyView>(await api.post('/api/dashboard/buyers/calendly/connect', { token })));
export const useRefreshCalendly = () =>
  useCalendlyWrite(async (api, _: void) => one<CalendlyView>(await api.post('/api/dashboard/buyers/calendly/refresh')));
export const useDisconnectCalendly = () =>
  useCalendlyWrite(async (api, _: void) => one<CalendlyView>(await api.delete('/api/dashboard/buyers/calendly')));

// The lead's prefilled Calendly link, fetched when asked for (copy button).
export function useBookingLink() {
  const api = useApi();
  return useMutation<{ url: string; agent: string | null }, ApiError, number>({
    mutationFn: async (leadId) => one<{ url: string; agent: string | null }>(await api.get(`/api/dashboard/buyers/${leadId}/booking-link`)),
  });
}

// One viewing as a calendar file (the API needs the login, so fetch + save).
export function useDownloadViewingIcs() {
  const api = useApi();
  return useMutation<void, ApiError, number>({
    mutationFn: async (viewingId) => {
      const res = await api.getRaw(`/api/dashboard/buyers/viewings/${viewingId}/ics`);
      const url = URL.createObjectURL(await res.blob());
      const a = document.createElement('a');
      a.href = url;
      a.download = `viewing-${viewingId}.ics`;
      document.body.appendChild(a);
      a.click();
      a.remove();
      setTimeout(() => URL.revokeObjectURL(url), 10_000);
    },
  });
}

const utc = (d: Date) => d.toISOString().replace(/[-:]/g, '').replace(/\.\d{3}/, '');

// Google Calendar's "add event" page with the viewing filled in.
export function googleCalendarUrl(v: { startsAt: string; durationMin: number; title: string; details?: string | null; location?: string | null }): string {
  const start = new Date(v.startsAt);
  const end = new Date(start.getTime() + Math.max(5, v.durationMin) * 60_000);
  const q = new URLSearchParams({ action: 'TEMPLATE', text: v.title, dates: `${utc(start)}/${utc(end)}` });
  if (v.details) q.set('details', v.details);
  if (v.location) q.set('location', v.location);
  return `https://calendar.google.com/calendar/render?${q}`;
}
