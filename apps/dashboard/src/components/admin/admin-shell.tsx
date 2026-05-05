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
      style={{ paddingLeft: mounted ? (collapsed ? 64 : 256) : 256 }}
      className="transition-[padding-left] duration-200 ease-out-expo"
    >
      {children}
    </div>
  );
}
