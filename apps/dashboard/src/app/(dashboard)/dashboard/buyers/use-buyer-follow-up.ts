'use client';

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useApi } from '@/hooks/use-api';
import { useTenantQueryScope } from '@/hooks/use-tenant-query-scope';
import {
  buyerKeys,
  type ApiError,
  type Buyer,
  type BuyerListItem,
  type BuyerListParams,
  type BuyerStage,
} from './use-buyers';

// A2 data: board, stage and question editors, tasks, files, answers.
// Same rules as use-buyers.ts: tenant scope in every key, api.* inline,
// writes invalidate everything under 'buyers'.

export interface BuyerQuestionOption {
  key: string;
  label: Record<string, string>;
}

export interface BuyerQuestion {
  id: number;
  qkey: string;
  label: Record<string, string>;
  options: BuyerQuestionOption[];
  multiple: boolean;
  showOnForm: boolean;
  isActive: boolean;
  sortOrder: number;
}

export interface BuyerTask {
  id: number;
  leadId: number;
  title: string;
  notes: string | null;
  assignedTo: number | null;
  assignedToUser: { id: number; name: string | null; email: string } | null;
  dueAt: string | null;
  doneAt: string | null;
  createdAt: string;
  lead?: Pick<BuyerListItem, 'id' | 'firstName' | 'lastName' | 'phone' | 'mobile' | 'contact'>;
}

export interface BuyerFile {
  id: number;
  leadId: number;
  name: string;
  mimeType: string;
  size: number;
  url: string;
  uploadedByUser: { id: number; name: string | null } | null;
  createdAt: string;
}

export interface BuyerBoard {
  stages: BuyerStage[];
  columns: Record<number, { total: number; data: BuyerListItem[] }>;
}

function one<T>(res: unknown): T {
  const r = res as { data?: T } | null;
  return (r && typeof r === 'object' && 'data' in r ? r.data : r) as T;
}

function toQuery(params: Record<string, unknown>): string {
  const q = new URLSearchParams();
  for (const [k, v] of Object.entries(params)) if (v !== undefined && v !== null && v !== '') q.set(k, String(v));
  const s = q.toString();
  return s ? `?${s}` : '';
}

export const followUpKeys = {
  board: (scope: readonly unknown[], params: BuyerListParams) => ['buyers', 'board', ...scope, params] as const,
  questions: (scope: readonly unknown[]) => ['buyers', 'questions', ...scope] as const,
  tasks: (scope: readonly unknown[], id: number) => ['buyers', 'tasks', ...scope, id] as const,
  due: (scope: readonly unknown[], before: string, agentId?: number) => ['buyers', 'due', ...scope, before, agentId ?? 'me'] as const,
  files: (scope: readonly unknown[], id: number) => ['buyers', 'files', ...scope, id] as const,
};

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

// ── Board ────────────────────────────────────────────────────────────────

export function useBuyerBoard(params: BuyerListParams) {
  const api = useApi();
  const { scope, ready } = useTenantQueryScope();
  return useQuery({
    queryKey: followUpKeys.board(scope, params),
    queryFn: async () => one<BuyerBoard>(await api.get(`/api/dashboard/buyers/board${toQuery({ ...params })}`)),
    enabled: ready && api.isReady,
  });
}

// Drag on the board: the card moves at once; on error the board is put back.
export function useMoveOnBoard(params: BuyerListParams) {
  const api = useApi();
  const queryClient = useQueryClient();
  const { scope } = useTenantQueryScope();
  const key = followUpKeys.board(scope, params);
  return useMutation<unknown, ApiError, { buyerId: number; from: number; to: number }, { previous?: BuyerBoard }>({
    mutationFn: ({ buyerId, to }) => api.put(`/api/dashboard/buyers/${buyerId}/stage`, { stageId: to }),
    onMutate: async ({ buyerId, from, to }) => {
      await queryClient.cancelQueries({ queryKey: key });
      const previous = queryClient.getQueryData<BuyerBoard>(key);
      if (previous) {
        const card = previous.columns[from]?.data.find((b) => b.id === buyerId);
        if (card) {
          const stage = previous.stages.find((s) => s.id === to) ?? null;
          const moved = { ...card, stageId: to, stage, lastActivityAt: new Date().toISOString() };
          queryClient.setQueryData<BuyerBoard>(key, {
            ...previous,
            columns: {
              ...previous.columns,
              [from]: { total: previous.columns[from].total - 1, data: previous.columns[from].data.filter((b) => b.id !== buyerId) },
              [to]: { total: (previous.columns[to]?.total ?? 0) + 1, data: [moved, ...(previous.columns[to]?.data ?? [])] },
            },
          });
        }
      }
      return { previous };
    },
    onError: (_err, _vars, ctx) => {
      if (ctx?.previous) queryClient.setQueryData(key, ctx.previous);
    },
    onSettled: () => {
      void queryClient.invalidateQueries({ queryKey: buyerKeys.all });
    },
  });
}

// ── Stages ───────────────────────────────────────────────────────────────

export type StageInput = { name: Record<string, string>; color?: string; kind?: BuyerStage['kind']; probability?: number | null };

export function useCreateStage() {
  return useWrite(async (api, body: StageInput) => one<BuyerStage>(await api.post('/api/dashboard/buyers/stages', body)));
}
export function useUpdateStage() {
  return useWrite(async (api, { id, ...body }: Partial<StageInput> & { id: number }) =>
    one<BuyerStage>(await api.put(`/api/dashboard/buyers/stages/${id}`, body)),
  );
}
export function useReorderStages() {
  return useWrite(async (api, ids: number[]) => one<BuyerStage[]>(await api.put('/api/dashboard/buyers/stages/order', { ids })));
}
export function useDeleteStage() {
  return useWrite(async (api, { id, moveTo }: { id: number; moveTo?: number }) =>
    api.delete(`/api/dashboard/buyers/stages/${id}${moveTo ? `?moveTo=${moveTo}` : ''}`),
  );
}

// ── Questions ────────────────────────────────────────────────────────────

export function useBuyerQuestions() {
  const api = useApi();
  const { scope, ready } = useTenantQueryScope();
  return useQuery({
    queryKey: followUpKeys.questions(scope),
    queryFn: async () => one<BuyerQuestion[]>(await api.get('/api/dashboard/buyers/questions')) ?? [],
    enabled: ready && api.isReady,
    staleTime: 5 * 60_000,
  });
}

export type QuestionInput = {
  label: Record<string, string>;
  options: { key?: string; label: Record<string, string> }[];
  multiple?: boolean;
  showOnForm?: boolean;
  isActive?: boolean;
};

export function useCreateQuestion() {
  return useWrite(async (api, body: QuestionInput) => one<BuyerQuestion>(await api.post('/api/dashboard/buyers/questions', body)));
}
export function useUpdateQuestion() {
  return useWrite(async (api, { id, ...body }: Partial<QuestionInput> & { id: number }) =>
    one<BuyerQuestion>(await api.put(`/api/dashboard/buyers/questions/${id}`, body)),
  );
}
export function useReorderQuestions() {
  return useWrite(async (api, ids: number[]) => one<BuyerQuestion[]>(await api.put('/api/dashboard/buyers/questions/order', { ids })));
}
export function useDeleteQuestion() {
  return useWrite(async (api, id: number) => api.delete(`/api/dashboard/buyers/questions/${id}`));
}

export function useSetAnswers(buyerId: number) {
  return useWrite(async (api, answers: Record<string, string[]>) =>
    one<Buyer>(await api.put(`/api/dashboard/buyers/${buyerId}/answers`, { answers })),
  );
}

// ── Tasks ────────────────────────────────────────────────────────────────

export function useBuyerTasks(buyerId: number) {
  const api = useApi();
  const { scope, ready } = useTenantQueryScope();
  return useQuery({
    queryKey: followUpKeys.tasks(scope, buyerId),
    queryFn: async () => one<BuyerTask[]>(await api.get(`/api/dashboard/buyers/${buyerId}/tasks`)) ?? [],
    enabled: ready && api.isReady && buyerId > 0,
  });
}

// Open tasks due before `before` (the end of the viewer's local day).
export function useDueTasks(before: string, agentId?: number) {
  const api = useApi();
  const { scope, ready } = useTenantQueryScope();
  return useQuery({
    queryKey: followUpKeys.due(scope, before, agentId),
    queryFn: async () =>
      one<BuyerTask[]>(await api.get(`/api/dashboard/buyers/tasks/due${toQuery({ before, agentId })}`)) ?? [],
    enabled: ready && api.isReady,
  });
}

export type TaskInput = { title: string; notes?: string | null; dueAt?: string | null; assignedTo?: number | null };

export function useCreateTask(buyerId: number) {
  return useWrite(async (api, body: TaskInput) => one<BuyerTask>(await api.post(`/api/dashboard/buyers/${buyerId}/tasks`, body)));
}
export function useUpdateTask() {
  return useWrite(async (api, { id, ...body }: Partial<TaskInput> & { id: number; done?: boolean }) =>
    one<BuyerTask>(await api.put(`/api/dashboard/buyers/tasks/${id}`, body)),
  );
}
export function useDeleteTask() {
  return useWrite(async (api, id: number) => api.delete(`/api/dashboard/buyers/tasks/${id}`));
}

// ── Files ────────────────────────────────────────────────────────────────

export function useBuyerFiles(buyerId: number) {
  const api = useApi();
  const { scope, ready } = useTenantQueryScope();
  return useQuery({
    queryKey: followUpKeys.files(scope, buyerId),
    queryFn: async () => one<BuyerFile[]>(await api.get(`/api/dashboard/buyers/${buyerId}/files`)) ?? [],
    enabled: ready && api.isReady && buyerId > 0,
  });
}

export function useUploadBuyerFile(buyerId: number) {
  return useWrite(async (api, file: File) => {
    const form = new FormData();
    form.append('file', file);
    return one<BuyerFile>(await api.post(`/api/dashboard/buyers/${buyerId}/files`, form));
  });
}

export function useDeleteBuyerFile() {
  return useWrite(async (api, id: number) => api.delete(`/api/dashboard/buyers/files/${id}`));
}

// ── Display helpers ──────────────────────────────────────────────────────

export function textOf(t: Record<string, string> | null | undefined, lang = 'en'): string {
  if (!t) return '';
  return t[lang] || t.en || Object.values(t)[0] || '';
}

// End of today in the browser's time zone, as ISO.
export function endOfToday(): string {
  const d = new Date();
  d.setHours(23, 59, 59, 999);
  return d.toISOString();
}
