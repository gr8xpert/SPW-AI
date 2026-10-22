'use client';

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useApi } from '@/hooks/use-api';
import { useTenantQueryScope } from '@/hooks/use-tenant-query-scope';
import { buyerKeys, one, type ApiError } from './use-buyers';
import type { MatchProperty } from './use-buyer-match';

// Milestone I data: trips, viewings, My day, the agent's daily email switch.
// Same rules as use-buyers.ts: tenant scope in every key, api.* inline,
// writes invalidate everything under 'buyers'.

export type ViewingStatus = 'planned' | 'done' | 'cancelled' | 'no_show';
export const VIEWING_STATUSES: ViewingStatus[] = ['planned', 'done', 'cancelled', 'no_show'];

export interface Viewing {
  id: number;
  leadId: number;
  tripId: number | null;
  propertyId: number | null;
  title: string | null;
  startsAt: string;
  durationMin: number;
  agent: { id: number; name: string | null } | null;
  meetingPoint: string | null;
  status: ViewingStatus;
  feedback: string | null;
  interest: number | null;
  property: MatchProperty | null;
  buyer?: { id: number; name: string | null };
}

export interface Trip {
  id: number;
  startDate: string;
  endDate: string;
  notes: string | null;
  viewings: Viewing[];
}

export interface ViewingBody {
  tripId?: number | null;
  propertyId?: number | null;
  title?: string | null;
  startsAt?: string;
  durationMin?: number;
  agentId?: number | null;
  meetingPoint?: string | null;
  status?: ViewingStatus;
  feedback?: string | null;
  interest?: number | null;
}

export interface HomeData {
  agentId: number;
  today: string;
  pipeline: { stageId: number | null; name: Record<string, string> | null; color: string | null; count: number }[];
  overdueTasks: { id: number; title: string; dueAt: string; buyerId: number; buyer: string }[];
  todayTasks: { id: number; title: string; dueAt: string; buyerId: number; buyer: string }[];
  viewings: Viewing[];
  waiting: { buyerId: number; buyer: string; since: string | null }[];
  hot: { buyerId: number; buyer: string; score: number }[];
  alertsToApprove: number;
}

export function useBuyerTrips(id: number) {
  const api = useApi();
  const { scope, ready } = useTenantQueryScope();
  return useQuery({
    queryKey: ['buyers', 'trips', ...scope, id] as const,
    queryFn: async () => one<{ trips: Trip[]; loose: Viewing[] }>(await api.get(`/api/dashboard/buyers/${id}/trips`)),
    enabled: ready && api.isReady && id > 0,
  });
}

export function useBuyerHome(agentId?: number) {
  const api = useApi();
  const { scope, ready } = useTenantQueryScope();
  return useQuery({
    queryKey: ['buyers', 'home', ...scope, agentId ?? 'me'] as const,
    queryFn: async () => one<HomeData>(await api.get(`/api/dashboard/buyers/home${agentId ? `?agentId=${agentId}` : ''}`)),
    enabled: ready && api.isReady,
    refetchInterval: 5 * 60_000,
  });
}

export function useMyDigest() {
  const api = useApi();
  const { scope, ready } = useTenantQueryScope();
  return useQuery({
    queryKey: ['buyers', 'my-digest', ...scope] as const,
    queryFn: async () => one<{ on: boolean }>(await api.get('/api/dashboard/buyers/me/digest')),
    enabled: ready && api.isReady,
  });
}

function useWrite<TVars, TResult>(fn: (api: ReturnType<typeof useApi>, vars: TVars) => Promise<TResult>) {
  const api = useApi();
  const queryClient = useQueryClient();
  return useMutation<TResult, ApiError, TVars>({
    mutationFn: (vars) => fn(api, vars),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: buyerKeys.all });
    },
  });
}

export const useSetMyDigest = () => useWrite(async (api, on: boolean) => one<{ on: boolean }>(await api.put('/api/dashboard/buyers/me/digest', { on })));

export const useCreateTrip = (buyerId: number) =>
  useWrite(async (api, body: { startDate: string; endDate: string; notes?: string | null }) => one<Trip>(await api.post(`/api/dashboard/buyers/${buyerId}/trips`, body)));

export const useUpdateTrip = () =>
  useWrite(async (api, { id, ...body }: { id: number; startDate?: string; endDate?: string; notes?: string | null }) =>
    one<Trip>(await api.put(`/api/dashboard/buyers/trips/${id}`, body)),
  );

export const useDeleteTrip = () =>
  useWrite(async (api, id: number) => {
    await api.delete(`/api/dashboard/buyers/trips/${id}`);
  });

export const useCreateViewing = (buyerId: number) =>
  useWrite(async (api, body: ViewingBody) => one<Viewing>(await api.post(`/api/dashboard/buyers/${buyerId}/viewings`, body)));

export const useUpdateViewing = () =>
  useWrite(async (api, { id, ...body }: ViewingBody & { id: number }) => one<Viewing>(await api.put(`/api/dashboard/buyers/viewings/${id}`, body)));

export const useDeleteViewing = () =>
  useWrite(async (api, id: number) => {
    await api.delete(`/api/dashboard/buyers/viewings/${id}`);
  });

export const useSendItinerary = () =>
  useWrite(async (api, { tripId, lang }: { tripId: number; lang?: string }) =>
    one<{ to: string }>(await api.post(`/api/dashboard/buyers/trips/${tripId}/itinerary/send`, lang ? { lang } : {})),
  );

// Downloads the itinerary PDF of a trip.
export function useItineraryPdf() {
  const api = useApi();
  return useMutation<void, Error, { tripId: number; lang?: string }>({
    mutationFn: async ({ tripId, lang }) => {
      const res = await api.getRaw(`/api/dashboard/buyers/trips/${tripId}/itinerary.pdf${lang ? `?lang=${lang}` : ''}`);
      const name = /filename="([^"]+)"/.exec(res.headers.get('content-disposition') || '')?.[1] || 'Itinerary.pdf';
      const url = URL.createObjectURL(await res.blob());
      const a = document.createElement('a');
      a.href = url;
      a.download = name;
      document.body.appendChild(a);
      a.click();
      a.remove();
      setTimeout(() => URL.revokeObjectURL(url), 10_000);
    },
  });
}
