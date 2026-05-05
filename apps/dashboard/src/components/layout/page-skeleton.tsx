'use client';

import { motion } from 'framer-motion';

function Pulse({ className }: { className?: string }) {
  return (
    <motion.div
      className={`rounded bg-muted ${className}`}
      animate={{ opacity: [0.4, 0.7, 0.4] }}
      transition={{ duration: 1.6, repeat: Infinity, ease: 'easeInOut' }}
    />
  );
}

export function PageSkeleton() {
  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      transition={{ duration: 0.15 }}
      className="space-y-6"
    >
      {/* Page header */}
      <div className="flex items-center justify-between">
        <div className="space-y-2">
          <Pulse className="h-7 w-48" />
          <Pulse className="h-4 w-72" />
        </div>
        <Pulse className="h-10 w-32 rounded-md" />
      </div>

      {/* Stat cards */}
      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
        {Array.from({ length: 4 }).map((_, i) => (
          <div key={i} className="border bg-card p-6 space-y-3">
            <div className="flex items-center justify-between">
              <Pulse className="h-4 w-24" />
              <Pulse className="h-8 w-8 rounded" />
            </div>
            <Pulse className="h-8 w-20" />
            <Pulse className="h-3 w-32" />
          </div>
        ))}
      </div>

      {/* Content area */}
      <div className="border bg-card p-6 space-y-4">
        <div className="flex items-center justify-between pb-2">
          <Pulse className="h-5 w-36" />
          <div className="flex gap-2">
            <Pulse className="h-9 w-24 rounded-md" />
            <Pulse className="h-9 w-9 rounded-md" />
          </div>
        </div>
        {Array.from({ length: 5 }).map((_, i) => (
          <div key={i} className="flex items-center gap-4 py-3">
            <Pulse className="h-10 w-10 rounded shrink-0" />
            <div className="flex-1 space-y-2">
              <Pulse className="h-4 w-3/4" />
              <Pulse className="h-3 w-1/2" />
            </div>
            <Pulse className="h-8 w-20 rounded-md" />
          </div>
        ))}
      </div>
    </motion.div>
  );
}

export function TableSkeleton() {
  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      transition={{ duration: 0.15 }}
      className="space-y-6"
    >
      {/* Page header */}
      <div className="flex items-center justify-between">
        <div className="space-y-2">
          <Pulse className="h-7 w-40" />
          <Pulse className="h-4 w-64" />
        </div>
        <Pulse className="h-10 w-36 rounded-md" />
      </div>

      {/* Table */}
      <div className="border bg-card overflow-hidden">
        {/* Table header */}
        <div className="flex items-center gap-4 p-4 border-b bg-muted/30">
          {Array.from({ length: 5 }).map((_, i) => (
            <Pulse key={i} className="h-4 flex-1" />
          ))}
        </div>
        {/* Table rows */}
        {Array.from({ length: 8 }).map((_, i) => (
          <div key={i} className="flex items-center gap-4 p-4 border-b last:border-0">
            {Array.from({ length: 5 }).map((_, j) => (
              <Pulse key={j} className="h-4 flex-1" />
            ))}
          </div>
        ))}
      </div>
    </motion.div>
  );
}
