'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { apiGet } from '@/lib/api';

export interface BulkJobStatus {
  jobId: string;
  status: string;
  progress: number;
  total: number;
  completed: number;
  failed: number;
  skipped?: number;
}

interface UseBulkJobOptions {
  // GET → { job: BulkJobStatus | null } — the tenant's run still in flight.
  activeUrl: string;
  // GET → BulkJobStatus for one job.
  statusUrl: (jobId: string) => string;
  // Fires once when a tracked job reaches completed/failed.
  onFinished?: (status: BulkJobStatus) => void;
  intervalMs?: number;
}

const FINISHED = new Set(['completed', 'failed']);
// A few blips (API restart, flaky wifi) shouldn't drop the progress bar, but a
// job that has truly vanished shouldn't be polled forever either.
const MAX_CONSECUTIVE_ERRORS = 5;

function unwrap<T>(res: any): T {
  return (res && typeof res === 'object' && 'data' in res ? res.data : res) as T;
}

// Tracks a server-side BullMQ job (bulk SEO, bulk translate). Progress lives on
// the server, not in the page: on mount the hook asks the API whether a run is
// already in flight and resumes polling it, so a refresh or navigating away
// and back picks the progress bar up where it was instead of offering a fresh
// (and freshly billed) start.
export function useBulkJob({ activeUrl, statusUrl, onFinished, intervalMs = 3000 }: UseBulkJobOptions) {
  const [jobId, setJobId] = useState<string | null>(null);
  const [status, setStatus] = useState<BulkJobStatus | null>(null);

  const statusUrlRef = useRef(statusUrl);
  const onFinishedRef = useRef(onFinished);
  statusUrlRef.current = statusUrl;
  onFinishedRef.current = onFinished;

  // Resume a run started earlier — from this tab before a refresh, another
  // tab, or a teammate.
  useEffect(() => {
    let live = true;
    apiGet<any>(activeUrl)
      .then((res) => {
        const job = unwrap<{ job: BulkJobStatus | null }>(res)?.job;
        if (live && job?.jobId && !FINISHED.has(job.status)) {
          setStatus(job);
          setJobId((current) => current ?? job.jobId);
        }
      })
      .catch(() => {});
    return () => {
      live = false;
    };
  }, [activeUrl]);

  useEffect(() => {
    if (!jobId) return;
    let live = true;
    let errors = 0;

    const tick = async () => {
      try {
        const s = unwrap<BulkJobStatus & { status: string }>(await apiGet<any>(statusUrlRef.current(jobId)));
        if (!live) return;
        errors = 0;
        if (!s || s.status === 'not_found') {
          setJobId(null);
          setStatus(null);
          return;
        }
        setStatus(s);
        if (FINISHED.has(s.status)) {
          setJobId(null);
          setStatus(null);
          onFinishedRef.current?.(s);
        }
      } catch (err: any) {
        if (!live) return;
        // 404 = job expired from Redis; nothing left to track.
        if (err?.response?.status === 404 || ++errors >= MAX_CONSECUTIVE_ERRORS) {
          setJobId(null);
          setStatus(null);
        }
      }
    };

    tick();
    const handle = setInterval(tick, intervalMs);
    return () => {
      live = false;
      clearInterval(handle);
    };
  }, [jobId, intervalMs]);

  // Call with the job id returned by the start endpoint (which may be an
  // already-running job the server handed back instead of queueing another).
  const track = useCallback((id: string) => {
    setStatus((prev) => (prev?.jobId === id ? prev : null));
    setJobId(id);
  }, []);

  return {
    running: jobId !== null,
    progress: status?.progress ?? 0,
    status,
    track,
  };
}
