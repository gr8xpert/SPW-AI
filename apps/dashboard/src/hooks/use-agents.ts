'use client';

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useApi } from '@/hooks/use-api';
import { useTenantQueryScope } from '@/hooks/use-tenant-query-scope';

// The Agents page (was Team): one list of people for the website and for
// buyers. API: /api/dashboard/team (Team add-on), /api/dashboard/agents
// (pickers, no add-on).

export type AgentAccess = 'manager' | 'agent' | 'none';

export interface Agent {
  id: number;
  email: string | null;
  name: string | null;
  role: string;
  access: AgentAccess;
  avatarUrl: string | null;
  title: string | null;
  phone: string | null;
  whatsapp: string | null;
  publicEmail: string | null;
  showOnWebsite: boolean;
  worksBuyers: boolean;
  canLogin: boolean;
  isActive: boolean;
  lastLoginAt: string | null;
  createdAt: string;
}

export interface AgentStats {
  currentUsers: number;
  maxUsers: number;
  admins: number;
  users: number;
}

export interface AgentInput {
  name?: string;
  access?: AgentAccess;
  email?: string;
  password?: string;
  title?: string;
  phone?: string;
  whatsapp?: string;
  publicEmail?: string;
  avatarUrl?: string;
  showOnWebsite?: boolean;
  worksBuyers?: boolean;
  isActive?: boolean;
}

const unwrap = <T,>(res: unknown): T => {
  const r = res as { data?: T } | null;
  return (r && typeof r === 'object' && 'data' in r ? r.data : r) as T;
};

export const agentKeys = {
  all: ['agents'] as const,
  list: (scope: readonly unknown[]) => ['agents', 'list', ...scope] as const,
  stats: (scope: readonly unknown[]) => ['agents', 'stats', ...scope] as const,
  options: (scope: readonly unknown[]) => ['agents', 'options', ...scope] as const,
};

export function useAgents() {
  const api = useApi();
  const { scope, ready } = useTenantQueryScope();
  return useQuery({
    queryKey: agentKeys.list(scope),
    queryFn: async () => unwrap<Agent[]>(await api.get('/api/dashboard/team')) ?? [],
    enabled: ready && api.isReady,
  });
}

export function useAgentStats() {
  const api = useApi();
  const { scope, ready } = useTenantQueryScope();
  return useQuery({
    queryKey: agentKeys.stats(scope),
    queryFn: async () => unwrap<AgentStats>(await api.get('/api/dashboard/team/stats')),
    enabled: ready && api.isReady,
  });
}

// Active people for pickers (property Agent, Settings website agent).
export function useAgentOptions() {
  const api = useApi();
  const { scope, ready } = useTenantQueryScope();
  return useQuery({
    queryKey: agentKeys.options(scope),
    queryFn: async () => unwrap<Agent[]>(await api.get('/api/dashboard/agents')) ?? [],
    enabled: ready && api.isReady,
  });
}

function useAgentMutation<TVars>(fn: (api: ReturnType<typeof useApi>, vars: TVars) => Promise<unknown>) {
  const api = useApi();
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (vars: TVars) => fn(api, vars),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: agentKeys.all });
      // Buyer pickers list the people who work buyers.
      void queryClient.invalidateQueries({ queryKey: ['buyers', 'agents'] });
    },
  });
}

export const useCreateAgent = () => useAgentMutation((api, input: AgentInput) => api.post('/api/dashboard/team', input));
export const useUpdateAgent = () =>
  useAgentMutation((api, { id, input }: { id: number; input: AgentInput }) => api.put(`/api/dashboard/team/${id}`, input));
export const useRemoveAgent = () => useAgentMutation((api, id: number) => api.delete(`/api/dashboard/team/${id}`));
export const useResetAgentPassword = () =>
  useAgentMutation((api, { id, newPassword }: { id: number; newPassword: string }) =>
    api.post(`/api/dashboard/team/${id}/reset-password`, { newPassword }),
  );

export function initialsOf(name: string | null | undefined): string {
  return (name || '?').split(/\s+/).filter(Boolean).slice(0, 2).map((w) => w.charAt(0)).join('').toUpperCase();
}

// Choices for a property's Agent (people on the website) or Sales agent
// (logins). The current choice stays listed even when it no longer fits.
export function agentChoices<T extends { id: number; showOnWebsite?: boolean; canLogin?: boolean; isActive?: boolean }>(
  people: T[],
  kind: 'website' | 'sales',
  currentId?: string | number | null,
): T[] {
  return people.filter(
    (p) => String(p.id) === String(currentId ?? '') || (p.isActive !== false && (kind === 'website' ? p.showOnWebsite : p.canLogin !== false)),
  );
}
