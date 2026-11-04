'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useEffect, useState } from 'react';
import { cn } from '@/lib/utils';
import { motion, AnimatePresence } from 'framer-motion';
import {
  Shield,
  Home,
  Users,
  CreditCard,
  Ticket,
  FileText,
  Mail,
  Clock,
  Gauge,
  Layers,
  Package,
  Receipt,
  PanelLeftClose,
  PanelLeftOpen,
  MapPin,
  Building2,
  HeartPulse,
  Languages,
  MapPinned,
  KeyRound,
} from 'lucide-react';
import { create } from 'zustand';
import { persist } from 'zustand/middleware';

interface AdminSidebarState {
  collapsed: boolean;
  toggle: () => void;
  // Below the lg breakpoint the sidebar is a drawer over the page.
  mobileOpen: boolean;
  setMobileOpen: (open: boolean) => void;
}

export const useAdminSidebarStore = create<AdminSidebarState>()(
  persist(
    (set) => ({
      collapsed: false,
      toggle: () => set((state) => ({ collapsed: !state.collapsed })),
      mobileOpen: false,
      setMobileOpen: (mobileOpen) => set({ mobileOpen }),
    }),
    {
      name: 'admin-sidebar-collapsed',
      partialize: (state) => ({ collapsed: state.collapsed }),
    }
  )
);

const navigation = [
  { name: 'Dashboard', href: '/admin', icon: Home },
  { name: 'Clients', href: '/admin/clients', icon: Users },
  { name: 'Client Health', href: '/admin/client-health', icon: HeartPulse },
  { name: 'Location Template', href: '/admin/location-template', icon: MapPin },
  { name: 'Property Type Template', href: '/admin/property-type-template', icon: Building2 },
  { name: 'Translation Memory', href: '/admin/translation-memory', icon: Languages },
  { name: 'Rightmove Places', href: '/admin/rightmove-places', icon: MapPinned },
];

const support = [
  { name: 'All Tickets', href: '/admin/tickets', icon: Ticket },
  { name: 'Webmasters', href: '/admin/webmasters', icon: Clock },
];

const billing = [
  { name: 'Credits', href: '/admin/credits', icon: CreditCard },
  { name: 'Credit Packages', href: '/admin/credit-packages', icon: Package },
  { name: 'Plugin Licences', href: '/admin/plugin-licenses', icon: KeyRound },
  { name: 'Xero Sync', href: '/admin/xero-sync', icon: Receipt },
];

const system = [
  { name: 'Audit Log', href: '/admin/audit-log', icon: FileText },
  { name: 'Email Suppressions', href: '/admin/suppressions', icon: Mail },
  { name: 'Rate Limits', href: '/admin/rate-limits', icon: Gauge },
  { name: 'Queue Depth', href: '/admin/queue-depth', icon: Layers },
];

function NavSection({
  title,
  items,
  pathname,
  collapsed,
}: {
  title: string;
  items: typeof navigation;
  pathname: string;
  collapsed: boolean;
}) {
  return (
    <div className="space-y-0.5">
      <AnimatePresence>
        {!collapsed && (
          <motion.h3
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.15 }}
            className="mb-1 px-3 text-[10px] font-semibold text-muted-foreground/70 uppercase tracking-widest"
          >
            {title}
          </motion.h3>
        )}
      </AnimatePresence>
      {items.map((item) => {
        const isActive = pathname === item.href || (item.href.split('/').length > 2 && pathname.startsWith(item.href + '/'));
        return (
          <Link
            key={item.name}
            href={item.href}
            className={cn(
              'group relative flex items-center gap-2.5 rounded-lg px-3 py-1.5 text-[13px] font-medium transition-colors duration-150',
              collapsed && 'justify-center px-2',
              !isActive && 'text-muted-foreground hover:text-foreground'
            )}
            title={collapsed ? item.name : undefined}
          >
            {isActive && (
              <motion.div
                layoutId="admin-nav-active"
                className="absolute inset-0 rounded-lg bg-primary shadow-sm"
                transition={{ type: "spring", stiffness: 300, damping: 24 }}
              />
            )}
            <item.icon
              className={cn(
                'h-4 w-4 shrink-0 relative z-10 transition-transform duration-150',
                isActive
                  ? 'text-primary-foreground'
                  : 'text-muted-foreground/70 group-hover:text-foreground group-hover:scale-105'
              )}
            />
            <AnimatePresence>
              {!collapsed && (
                <motion.span
                  initial={{ opacity: 0, width: 0 }}
                  animate={{ opacity: 1, width: 'auto' }}
                  exit={{ opacity: 0, width: 0 }}
                  transition={{ duration: 0.15 }}
                  className={cn(
                    'relative z-10 whitespace-nowrap overflow-hidden',
                    isActive ? 'text-primary-foreground' : ''
                  )}
                >
                  {item.name}
                </motion.span>
              )}
            </AnimatePresence>
          </Link>
        );
      })}
    </div>
  );
}

export function AdminSidebar() {
  const pathname = usePathname();
  const { collapsed: collapsedSetting, toggle, mobileOpen, setMobileOpen } = useAdminSidebarStore();
  // The icon-only rail is desktop only: the drawer always shows the labels.
  const [isDesktop, setIsDesktop] = useState(true);
  const collapsed = collapsedSetting && isDesktop;

  useEffect(() => {
    const query = window.matchMedia('(min-width: 1024px)');
    const update = () => setIsDesktop(query.matches);
    update();
    query.addEventListener('change', update);
    return () => query.removeEventListener('change', update);
  }, []);

  // Moving to another page, or pressing Esc, closes the drawer.
  useEffect(() => {
    setMobileOpen(false);
  }, [pathname, setMobileOpen]);

  useEffect(() => {
    if (!mobileOpen) return;
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setMobileOpen(false);
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [mobileOpen, setMobileOpen]);

  return (
    <>
    {mobileOpen && (
      <div
        className="fixed inset-0 z-[45] bg-black/50 lg:hidden"
        onClick={() => setMobileOpen(false)}
        aria-hidden="true"
      />
    )}
    <aside
      style={{ '--sidebar-w': `${collapsed ? 64 : 256}px` } as React.CSSProperties}
      className={cn(
        'fixed inset-y-0 left-0 z-50 w-64 lg:w-[var(--sidebar-w)] bg-card border-r border-border/60 flex flex-col overflow-hidden transition-[width,transform,visibility] duration-200 ease-out-expo',
        !mobileOpen && 'max-lg:invisible max-lg:-translate-x-full'
      )}
      // A link to the page you are already on does not change the pathname.
      onClick={(e) => {
        if ((e.target as HTMLElement).closest('a')) setMobileOpen(false);
      }}
    >
      {/* Logo */}
      <div className="h-14 flex items-center px-4 border-b border-border/60">
        <Link href="/admin" className="flex items-center gap-2.5 overflow-hidden">
          <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-primary">
            <Shield className="h-4 w-4 text-primary-foreground" />
          </div>
          <AnimatePresence>
            {!collapsed && (
              <motion.span
                initial={{ opacity: 0, width: 0 }}
                animate={{ opacity: 1, width: 'auto' }}
                exit={{ opacity: 0, width: 0 }}
                transition={{ duration: 0.15 }}
                className="font-semibold text-base tracking-tight whitespace-nowrap"
              >
                SPM Admin
              </motion.span>
            )}
          </AnimatePresence>
        </Link>
      </div>

      {/* Navigation */}
      <nav className="flex-1 overflow-y-auto px-2 py-3 space-y-3">
        <NavSection title="Main" items={navigation} pathname={pathname} collapsed={collapsed} />
        <NavSection title="Support" items={support} pathname={pathname} collapsed={collapsed} />
        <NavSection title="Billing" items={billing} pathname={pathname} collapsed={collapsed} />
        <NavSection title="System" items={system} pathname={pathname} collapsed={collapsed} />
      </nav>

      {/* Collapse Toggle */}
      <div className="hidden lg:block border-t border-border/60 px-2 py-2">
        <button
          onClick={toggle}
          className="flex w-full items-center justify-center gap-2 rounded-lg px-3 py-2 text-sm text-muted-foreground hover:bg-accent hover:text-foreground transition-colors"
          title={collapsed ? 'Expand sidebar' : 'Collapse sidebar'}
        >
          {collapsed ? (
            <PanelLeftOpen className="h-4 w-4" />
          ) : (
            <>
              <PanelLeftClose className="h-4 w-4" />
              <span className="text-xs">Collapse</span>
            </>
          )}
        </button>
      </div>
    </aside>
    </>
  );
}
