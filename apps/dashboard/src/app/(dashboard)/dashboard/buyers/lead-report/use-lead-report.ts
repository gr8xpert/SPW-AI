'use client';

import { keepPreviousData, useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useApi } from '@/hooks/use-api';
import { useTenantQueryScope } from '@/hooks/use-tenant-query-scope';
import { buyerKeys, one, type ApiError, type BuyerActivity, type BuyerStage } from '../use-buyers';

// Lead Report (api /api/dashboard/buyers/lead-report[/summary|.csv]). Keys
// live under buyerKeys.all, so every buyer change refreshes the report.

export type FollowUpStatus = 'overdue' | 'not_contacted' | 'tried' | 'call_back' | 'wrong_number' | 'reached';
export type CallOutcome = 'answered' | 'no_answer' | 'wrong_number' | 'call_back';
export const CALL_OUTCOMES: CallOutcome[] = ['answered', 'no_answer', 'call_back', 'wrong_number'];

export interface LeadReportRow {
  id: number;
  name: string;
  email: string | null;
  phone: string | null;
  mobile: string | null;
  source: string;
  role: string;
  isNewLead: boolean;
  createdAt: string;
  stage: Pick<BuyerStage, 'id' | 'name' | 'color' | 'kind'> | null;
  agent: { id: number; name: string | null } | null;
  budgetMin: number | null;
  budgetMax: number | null;
  followUp: {
    status: FollowUpStatus;
    calls: number;
    whatsapps: number;
    emails: number;
    lastOutcome: CallOutcome | null;
    firstContactAt: string | null;
    lastContactAt: string | null;
    firstContactHours: number | null;
    lastNote: { text: string; at: string; type: string } | null;
    enquiry: string | null;
  };
}

export interface AgentLine {
  agentId: number | null;
  name?: string | null;
  leads: number;
  notContacted: number;
  overdue: number;
  contacted: number;
  reached: number;
  won: number;
  medianFirstContactHours: number | null;
  calls: number;
  whatsapps: number;
  emails: number;
  viewings: number;
}

export interface LeadReportParams {
  q?: string;
  agentId?: string;
  stageId?: string;
  source?: string;
  status?: string;
  from?: string;
  sort?: string;
  page?: number;
  limit?: number;
}

export function reportQuery(params: LeadReportParams): string {
  const q = new URLSearchParams();
  for (const [k, v] of Object.entries(params)) if (v !== undefined && v !== '') q.set(k, String(v));
  const s = q.toString();
  return s ? `?${s}` : '';
}

export function useLeadReport(params: LeadReportParams) {
  const api = useApi();
  const { scope, ready } = useTenantQueryScope();
  return useQuery({
    queryKey: [...buyerKeys.all, 'lead-report', ...scope, params],
    queryFn: async () => {
      const res = (await api.get(`/api/dashboard/buyers/lead-report${reportQuery(params)}`)) as {
        data: LeadReportRow[];
        total: number;
        overdueHours: number;
      };
      return { data: res?.data ?? [], total: res?.total ?? 0, overdueHours: res?.overdueHours ?? 24 };
    },
    enabled: ready && api.isReady,
    placeholderData: keepPreviousData,
  });
}

export function useLeadReportSummary(params: LeadReportParams) {
  const api = useApi();
  const { scope, ready } = useTenantQueryScope();
  const { status: _s, sort: _o, page: _p, limit: _l, ...filters } = params;
  return useQuery({
    queryKey: [...buyerKeys.all, 'lead-report-summary', ...scope, filters],
    queryFn: async () => one<{ overdueHours: number; totals: AgentLine; agents: AgentLine[] }>(await api.get(`/api/dashboard/buyers/lead-report/summary${reportQuery(filters)}`)),
    enabled: ready && api.isReady,
    placeholderData: keepPreviousData,
  });
}

// Activity on any lead of the report (the row's id), with a call outcome.
export function useLogActivity() {
  const api = useApi();
  const queryClient = useQueryClient();
  return useMutation<BuyerActivity, ApiError, { id: number; type: 'call' | 'note'; description?: string; outcome?: CallOutcome }>({
    mutationFn: async ({ id, ...body }) => one<BuyerActivity>(await api.post(`/api/dashboard/buyers/${id}/activities`, body)),
    onSuccess: () => void queryClient.invalidateQueries({ queryKey: buyerKeys.all }),
  });
}

export function useSetStage() {
  const api = useApi();
  const queryClient = useQueryClient();
  return useMutation<unknown, ApiError, { id: number; stageId: number }>({
    mutationFn: async ({ id, stageId }) => api.put(`/api/dashboard/buyers/${id}/stage`, { stageId }),
    onSuccess: () => void queryClient.invalidateQueries({ queryKey: buyerKeys.all }),
  });
}

export function useSetAgent() {
  const api = useApi();
  const queryClient = useQueryClient();
  return useMutation<unknown, ApiError, { id: number; assignedTo: number | null }>({
    mutationFn: async ({ id, assignedTo }) => api.put(`/api/dashboard/buyers/${id}`, { assignedTo }),
    onSuccess: () => void queryClient.invalidateQueries({ queryKey: buyerKeys.all }),
  });
}

// "3 h", "2 d" — how long something took or has been waiting.
export function duration(hours: number): string {
  if (hours < 1) return `${Math.max(1, Math.round(hours * 60))} min`;
  if (hours < 48) return `${Math.round(hours)} h`;
  return `${Math.round(hours / 24)} d`;
}
