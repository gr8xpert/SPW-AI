import axios, { AxiosError, AxiosRequestConfig } from 'axios';
import { getSession, signOut } from 'next-auth/react';

const API_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3001';

export const api = axios.create({
  baseURL: API_URL,
  headers: {
    'Content-Type': 'application/json',
  },
});

// Request interceptor to add auth token
api.interceptors.request.use(
  async (config) => {
    if (typeof window !== 'undefined') {
      const session = await getSession();
      if (session?.accessToken) {
        config.headers.Authorization = `Bearer ${session.accessToken}`;
      }
    }
    return config;
  },
  (error) => Promise.reject(error)
);

// Response interceptor to handle errors
api.interceptors.response.use(
  (response) => response,
  async (error: AxiosError) => {
    if (error.response?.status === 401) {
      // Token expired or invalid, sign out
      if (typeof window !== 'undefined') {
        await signOut({ callbackUrl: '/login' });
      }
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
