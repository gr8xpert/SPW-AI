'use client';

import { useState, useCallback, useRef, useMemo } from 'react';
import { useSession, signOut } from 'next-auth/react';
import { useImpersonation } from './use-impersonation';

// A read that fails before any response arrives ("Failed to fetch") is retried
// twice with a short backoff. Browsers silently retry page navigations when a
// pooled connection has died (seen with HTTP/3 to Cloudflare on some networks)
// but never fetch() calls, so without this a data request can fail while the
// page itself loads, leaving it empty until a manual refresh. Only GET/HEAD:
// a write may already have reached the server, so repeating it is unsafe.
const READ_RETRY_DELAYS_MS = [400, 1200];

export async function fetchWithReadRetry(url: string, init: RequestInit): Promise<Response> {
  const method = (init.method || 'GET').toUpperCase();
  const retryable = method === 'GET' || method === 'HEAD';
  for (let attempt = 0; ; attempt++) {
    try {
      return await fetch(url, init);
    } catch (err) {
      const aborted = (err as { name?: string })?.name === 'AbortError';
      if (!retryable || aborted || attempt >= READ_RETRY_DELAYS_MS.length) throw err;
      await new Promise((resolve) => setTimeout(resolve, READ_RETRY_DELAYS_MS[attempt]));
    }
  }
}

interface UseApiOptions {
  onSuccess?: (data: any) => void;
  onError?: (error: Error) => void;
}

interface ApiState<T> {
  data: T | null;
  error: Error | null;
  isLoading: boolean;
}

export function useApi<T = any>(options: UseApiOptions = {}) {
  const { data: session, update } = useSession();
  const { session: impersonation } = useImpersonation();
  // Impersonation token wins over NextAuth session token when a super-admin
  // is acting as a client. The NextAuth session stays intact underneath so
  // Return-to-admin restores the original access token instantly.
  const effectiveAccessToken = impersonation?.accessToken ?? session?.accessToken;
  const [state, setState] = useState<ApiState<T>>({
    data: null,
    error: null,
    isLoading: false,
  });

  // Use refs for callbacks to avoid recreating functions on every render
  const onSuccessRef = useRef(options.onSuccess);
  const onErrorRef = useRef(options.onError);
  onSuccessRef.current = options.onSuccess;
  onErrorRef.current = options.onError;

  const apiUrl = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3001';

  const request = useCallback(
    async (
      endpoint: string,
      requestOptions: RequestInit = {}
    ): Promise<T | null> => {
      setState((prev) => ({ ...prev, isLoading: true, error: null }));

      try {
        const isFormData = requestOptions.body instanceof FormData;
        const headers: HeadersInit = {
          ...(isFormData ? {} : { 'Content-Type': 'application/json' }),
          ...requestOptions.headers,
        };

        // Add auth token if available
        if (effectiveAccessToken) {
          (headers as Record<string, string>)['Authorization'] =
            `Bearer ${effectiveAccessToken}`;
        }

        let response = await fetchWithReadRetry(`${apiUrl}${endpoint}`, {
          ...requestOptions,
          headers,
        });

        // On 401, force next-auth to refresh the session and retry once.
        // Common cause: cached token has expired after a long idle period.
        // Skip the refresh-and-bounce dance when running as an impersonation
        // session — impersonation tokens can't be refreshed via NextAuth,
        // and signing out here would kill the super-admin's real session.
        if (response.status === 401 && session?.accessToken && !impersonation) {
          try {
            const refreshed = await update();
            const newToken = (refreshed as any)?.accessToken;
            if (newToken && newToken !== session.accessToken) {
              (headers as Record<string, string>)['Authorization'] = `Bearer ${newToken}`;
              response = await fetchWithReadRetry(`${apiUrl}${endpoint}`, { ...requestOptions, headers });
            }
          } catch {
            // Refresh failed — fall through to throw below so the caller can react.
          }
          if (response.status === 401) {
            // Persistent 401 → session is unrecoverable; bounce user to login.
            signOut({ callbackUrl: '/login' });
          }
        }

        if (!response.ok) {
          const errorData = await response.json().catch(() => ({}));
          throw new Error(
            errorData.message || `Request failed with status ${response.status}`
          );
        }

        // Handle 204 No Content
        if (response.status === 204) {
          setState({ data: null, error: null, isLoading: false });
          onSuccessRef.current?.(null);
          return null;
        }

        const data = await response.json();
        setState({ data, error: null, isLoading: false });
        onSuccessRef.current?.(data);
        return data;
      } catch (error) {
        const err = error instanceof Error ? error : new Error('Unknown error');
        setState({ data: null, error: err, isLoading: false });
        onErrorRef.current?.(err);
        throw err;
      }
    },
    // `update` is required so the 401-retry path captures the latest
    // session-refresh function — without it, a stale `update` from the
    // first render could fail to actually refresh the token across long
    // idle periods.
    [apiUrl, effectiveAccessToken, session?.accessToken, update, impersonation]
  );

  const get = useCallback(
    (endpoint: string) => request(endpoint, { method: 'GET' }),
    [request]
  );

  const post = useCallback(
    (endpoint: string, body?: any) =>
      request(endpoint, {
        method: 'POST',
        body: body instanceof FormData ? body : body ? JSON.stringify(body) : undefined,
      }),
    [request]
  );

  const put = useCallback(
    (endpoint: string, body?: any) =>
      request(endpoint, {
        method: 'PUT',
        body: body ? JSON.stringify(body) : undefined,
      }),
    [request]
  );

  const patch = useCallback(
    (endpoint: string, body?: any) =>
      request(endpoint, {
        method: 'PATCH',
        body: body ? JSON.stringify(body) : undefined,
      }),
    [request]
  );

  const del = useCallback(
    (endpoint: string) => request(endpoint, { method: 'DELETE' }),
    [request]
  );

  const getRaw = useCallback(
    async (endpoint: string): Promise<Response> => {
      const headers: HeadersInit = {};
      if (effectiveAccessToken) {
        (headers as Record<string, string>)['Authorization'] =
          `Bearer ${effectiveAccessToken}`;
      }
      const response = await fetchWithReadRetry(`${apiUrl}${endpoint}`, { headers });
      if (!response.ok) {
        throw new Error(`Request failed with status ${response.status}`);
      }
      return response;
    },
    [apiUrl, effectiveAccessToken]
  );

  return {
    ...state,
    request,
    get,
    post,
    put,
    patch,
    delete: del,
    getRaw,
    isReady: !!effectiveAccessToken,
  };
}

// Simple fetcher for SWR
export const fetcher = async (url: string, token?: string) => {
  const apiUrl = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3001';
  const headers: HeadersInit = {
    'Content-Type': 'application/json',
  };

  if (token) {
    (headers as Record<string, string>)['Authorization'] = `Bearer ${token}`;
  }

  const response = await fetchWithReadRetry(`${apiUrl}${url}`, { headers });

  if (!response.ok) {
    const error = await response.json().catch(() => ({}));
    throw new Error(error.message || 'Request failed');
  }

  return response.json();
};
