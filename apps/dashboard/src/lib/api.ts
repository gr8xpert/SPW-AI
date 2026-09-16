import axios, { AxiosError, AxiosRequestConfig, InternalAxiosRequestConfig } from 'axios';
import { getSession, signOut } from 'next-auth/react';
import { getImpersonationSession } from './impersonation';

export interface ApiResponse<T> {
  data: T;
  meta?: Record<string, unknown>;
}

const API_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3001';

export const api = axios.create({
  baseURL: API_URL,
  headers: {
    'Content-Type': 'application/json',
  },
});

// Cached NextAuth access token.
//
// `getSession()` is NOT a local read — it performs an HTTP round-trip to
// /api/auth/session. Calling it inside the request interceptor meant every
// single API call cost two round-trips, and a page firing five parallel
// requests made five redundant session calls. We cache the token instead and
// treat a 401 as the invalidation signal (see the response interceptor).
//
// `AuthTokenSync` (mounted in providers.tsx) pushes the token in as soon as
// SessionProvider has it, so the common path never calls getSession() at all.
// The lazy fetch below only runs when a request beats the provider — e.g. a
// module-scope call during a hard page load.
let cachedAccessToken: string | null = null;
let inFlightSessionFetch: Promise<string | null> | null = null;

/** Push the current NextAuth access token into the cache. */
export function primeAuthToken(token: string | null): void {
  cachedAccessToken = token;
}

/** Drop the cached token so the next request re-reads the session. */
export function clearAuthToken(): void {
  cachedAccessToken = null;
}

// Concurrent cold-start requests share one in-flight getSession() rather than
// each firing their own.
async function resolveSessionToken(): Promise<string | null> {
  if (cachedAccessToken) return cachedAccessToken;
  if (!inFlightSessionFetch) {
    inFlightSessionFetch = getSession()
      .then((session) => {
        cachedAccessToken = session?.accessToken ?? null;
        return cachedAccessToken;
      })
      .finally(() => {
        inFlightSessionFetch = null;
      });
  }
  return inFlightSessionFetch;
}

// Request interceptor to add auth token.
//
// Impersonation wins over the NextAuth token, matching `useApi`'s precedence —
// without this, a super-admin acting as a client would hit these endpoints with
// their own super-admin token and see the wrong tenant's data. The read is a
// synchronous localStorage lookup, so it adds no latency.
api.interceptors.request.use(
  async (config) => {
    if (typeof window !== 'undefined') {
      const impersonationToken = getImpersonationSession()?.accessToken;
      const token = impersonationToken ?? (await resolveSessionToken());
      if (token) {
        config.headers.Authorization = `Bearer ${token}`;
      }
    }
    return config;
  },
  (error) => Promise.reject(error)
);

// Response interceptor to handle errors.
//
// A 401 means the cached token is stale (NextAuth rotated it) or the session is
// genuinely gone. Retry once with a freshly-fetched token before signing out —
// otherwise a routine token rotation would bounce the user to /login. Mirrors
// the retry-then-signOut behaviour in `useApi`.
//
// Impersonation tokens are deliberately excluded: they cannot be refreshed via
// NextAuth, and signing out here would kill the super-admin's real session.
api.interceptors.response.use(
  (response) => response,
  async (error: AxiosError) => {
    const original = error.config as
      | (InternalAxiosRequestConfig & { _authRetry?: boolean; _networkRetries?: number })
      | undefined;

    // No response at all = the request died on the way (dropped connection),
    // not a server answer. Retry reads twice with a short backoff; see
    // fetchWithReadRetry in hooks/use-api.ts for why. Writes are never repeated.
    const method = (original?.method || 'get').toLowerCase();
    if (
      original &&
      !error.response &&
      error.code !== 'ERR_CANCELED' &&
      (method === 'get' || method === 'head')
    ) {
      const attempt = original._networkRetries ?? 0;
      const delays = [400, 1200];
      if (attempt < delays.length) {
        original._networkRetries = attempt + 1;
        await new Promise((resolve) => setTimeout(resolve, delays[attempt]));
        return api.request(original);
      }
    }

    const isAuthFailure =
      error.response?.status === 401 &&
      typeof window !== 'undefined' &&
      !getImpersonationSession();

    if (isAuthFailure && original) {
      // Second 401 on the same request — the refreshed token didn't help, so
      // the session is unrecoverable.
      if (original._authRetry) {
        clearAuthToken();
        await signOut({ callbackUrl: '/login' });
        return Promise.reject(error);
      }

      const staleToken = cachedAccessToken;
      clearAuthToken();
      const freshToken = await resolveSessionToken();

      // Only worth retrying if the session actually handed us a different
      // token. An identical (or absent) one means this 401 is real, not a
      // rotation we missed — sign out rather than replay the same request.
      if (freshToken && freshToken !== staleToken) {
        original._authRetry = true;
        original.headers.Authorization = `Bearer ${freshToken}`;
        return api.request(original);
      }

      await signOut({ callbackUrl: '/login' });
    }

    return Promise.reject(error);
  }
);

// Generic request function with type safety
export async function apiRequest<T>(
  config: AxiosRequestConfig
): Promise<T> {
  const response = await api.request<T>(config);
  return response.data;
}

// Convenience methods
export const apiGet = <T>(url: string, config?: AxiosRequestConfig) =>
  apiRequest<T>({ ...config, method: 'GET', url });

export const apiPost = <T>(url: string, data?: unknown, config?: AxiosRequestConfig) =>
  apiRequest<T>({ ...config, method: 'POST', url, data });

export const apiPut = <T>(url: string, data?: unknown, config?: AxiosRequestConfig) =>
  apiRequest<T>({ ...config, method: 'PUT', url, data });

export const apiPatch = <T>(url: string, data?: unknown, config?: AxiosRequestConfig) =>
  apiRequest<T>({ ...config, method: 'PATCH', url, data });

export const apiDelete = <T>(url: string, config?: AxiosRequestConfig) =>
  apiRequest<T>({ ...config, method: 'DELETE', url });

// File upload helper
export async function uploadFile(
  file: File,
  onProgress?: (percent: number) => void
): Promise<{ id: number; url: string }> {
  const formData = new FormData();
  formData.append('file', file);

  const response = await api.post('/api/dashboard/upload', formData, {
    headers: {
      'Content-Type': 'multipart/form-data',
    },
    onUploadProgress: (progressEvent) => {
      if (progressEvent.total && onProgress) {
        const percent = Math.round((progressEvent.loaded * 100) / progressEvent.total);
        onProgress(percent);
      }
    },
  });

  return response.data;
}
