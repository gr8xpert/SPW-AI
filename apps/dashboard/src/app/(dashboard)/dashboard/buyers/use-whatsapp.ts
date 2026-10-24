'use client';

import { useMutation, useQueryClient } from '@tanstack/react-query';
import { useApi } from '@/hooks/use-api';
import { buyerKeys, one, type ApiError } from './use-buyers';
import type { SkippedProperty } from './use-buyer-match';

// WhatsApp click-to-chat (api …/whatsapp/preview|open). `base` is the
// person's route: /api/dashboard/buyers/:id or /api/dashboard/new-leads/:id.

export type WhatsAppKind = 'properties' | 'enquiry' | 'viewing' | 'follow_up';

export interface WhatsAppBody {
  kind: WhatsAppKind;
  propertyIds?: number[];
  viewingId?: number;
  taskId?: number;
  lang?: string;
  message?: string;
  allowResend?: boolean;
  phone?: string;
  markTaskDone?: boolean;
  markHandled?: boolean;
}

export interface WhatsAppPhone {
  label: 'mobile' | 'phone';
  number: string;
  digits: string;
  international: boolean;
}

export interface WhatsAppPreview {
  phones: WhatsAppPhone[];
  lang: string;
  message: string;
  text: string;
  skipped: SkippedProperty[];
  allSkipped: boolean;
  unsubscribed: boolean;
}

export function buyerWhatsAppBase(id: number): string {
  return `/api/dashboard/buyers/${id}`;
}

export function newLeadWhatsAppBase(id: number): string {
  return `/api/dashboard/new-leads/${id}`;
}

// The message as it will read; no cache (it follows the dialog's fields).
export function useWhatsAppPreview(base: string) {
  const api = useApi();
  return useMutation<WhatsAppPreview, ApiError, WhatsAppBody>({
    mutationFn: async (body) => one<WhatsAppPreview>(await api.post(`${base}/whatsapp/preview`, body)),
  });
}

// The wa.me link; the API records it as sent, so lists and activity refresh.
export function useWhatsAppOpen(base: string) {
  const api = useApi();
  const queryClient = useQueryClient();
  return useMutation<{ url: string; text: string }, ApiError, WhatsAppBody>({
    mutationFn: async (body) => one<{ url: string; text: string }>(await api.post(`${base}/whatsapp/open`, body)),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: buyerKeys.all });
      void queryClient.invalidateQueries({ queryKey: ['new-leads'] });
    },
  });
}
