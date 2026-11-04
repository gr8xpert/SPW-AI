'use client';

import { useEffect, useState } from 'react';
import { useAdminSidebarStore } from '@/components/admin/admin-sidebar';

export function AdminShell({ children }: { children: React.ReactNode }) {
  const collapsed = useAdminSidebarStore((s) => s.collapsed);
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
  }, []);

  return (
    <div
      style={{ '--sidebar-w': `${mounted && collapsed ? 64 : 256}px` } as React.CSSProperties}
      className="lg:pl-[var(--sidebar-w)] transition-[padding-left] duration-200 ease-out-expo"
    >
      {children}
    </div>
  );
}
