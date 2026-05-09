'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useSession } from 'next-auth/react';
import { useState } from 'react';
import { cn } from '@/lib/utils';
import { motion, AnimatePresence } from 'framer-motion';
import {
  Building2,
  Home,
  MapPin,
  Tag,
  Settings,
  Users,
  Ticket,
  Mail,
  BarChart3,
  Upload,
  FileOutput,
  Languages,
  UserCircle,
  Shield,
  CreditCard,
  MessageSquare,
  Timer,
  PanelLeftClose,
  PanelLeftOpen,
  Lock,
} from 'lucide-react';
import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import { useDashboardAddons, type DashboardAddonKey } from '@/hooks/use-dashboard-addons';
import { LockedFeatureDialog } from '@/components/locked-feature-dialog';

interface NavItem {
  name: string;
  href: string;
  icon: React.ComponentType<{ className?: string }>;
  // When set, the item locks automatically based on the tenant's
  // dashboardAddons. Click on a locked item opens the upgrade dialog
  // instead of navigating.
  addon?: DashboardAddonKey;
}

interface SidebarState {
  collapsed: boolean;
  toggle: () => void;
}

export const useSidebarStore = create<SidebarState>()(
  persist(
    (set) => ({
      collapsed: false,
      toggle: () => set((state) => ({ collapsed: !state.collapsed })),
    }),
    { name: 'sidebar-collapsed' }
  )
);

const navigation: NavItem[] = [
  { name: 'Dashboard', href: '/dashboard', icon: Home },
  { name: 'Properties', href: '/dashboard/properties', icon: Building2 },
  { name: 'Locations', href: '/dashboard/locations', icon: MapPin },
  { name: 'Property Types', href: '/dashboard/property-types', icon: Tag },
  { name: 'Features', href: '/dashboard/features', icon: Tag },
  { name: 'Labels', href: '/dashboard/labels', icon: Languages },
];

const marketing: NavItem[] = [
  { name: 'Contacts', href: '/dashboard/contacts', icon: Users },
  { name: 'Leads', href: '/dashboard/leads', icon: UserCircle },
  { name: 'Email Campaigns', href: '/dashboard/campaigns', icon: Mail, addon: 'emailCampaign' },
];

const integrations: NavItem[] = [
  { name: 'Feed Sources', href: '/dashboard/feeds', icon: Upload },
  { name: 'Feed Export', href: '/dashboard/feed-export', icon: FileOutput, addon: 'feedExport' },
];

const management: NavItem[] = [
  { name: 'Team', href: '/dashboard/team', icon: Users, addon: 'team' },
];

const other: NavItem[] = [
  { name: 'Analytics', href: '/dashboard/analytics', icon: BarChart3 },
  { name: 'AI Chat', href: '/dashboard/ai-chat', icon: MessageSquare, addon: 'aiChat' },
  { name: 'Support Tickets', href: '/dashboard/tickets', icon: Ticket },
  { name: 'Billing', href: '/dashboard/billing', icon: CreditCard },
  { name: 'Settings', href: '/dashboard/settings', icon: Settings },
];

const webmasterWork: NavItem[] = [
  { name: 'Time Tracking', href: '/dashboard/time-tracking', icon: Timer },
  { name: 'Assigned Tickets', href: '/dashboard/tickets', icon: Ticket },
];

function NavSection({
  title,
  items,
  pathname,
  collapsed,
  addons,
  onLockedClick,
}: {
  title: string;
  items: NavItem[];
  pathname: string;
  collapsed: boolean;
  addons: ReturnType<typeof useDashboardAddons>['addons'];
  onLockedClick: (name: string) => void;
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
        const locked = !!item.addon && !addons[item.addon];

        const baseClass = cn(
          'group relative flex items-center gap-2.5 rounded-lg px-3 py-1.5 text-[13px] font-medium transition-colors duration-150',
          collapsed && 'justify-center px-2',
          !isActive && !locked && 'text-muted-foreground hover:text-foreground',
          locked && 'cursor-pointer text-muted-foreground/50 hover:text-muted-foreground/70',
        );

        const inner = (
          <>
            {isActive && !locked && (
              <motion.div
                layoutId="nav-active"
                className="absolute inset-0 rounded-lg bg-primary shadow-sm"
                transition={{ type: 'spring', stiffness: 300, damping: 24 }}
              />
            )}
            <item.icon
              className={cn(
                'h-4 w-4 shrink-0 relative z-10 transition-transform duration-150',
                isActive && !locked
                  ? 'text-primary-foreground'
                  : locked
                    ? 'text-muted-foreground/40'
                    : 'text-muted-foreground/70 group-hover:text-foreground group-hover:scale-105',
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
                    'relative z-10 flex-1 whitespace-nowrap overflow-hidden',
                    isActive && !locked ? 'text-primary-foreground' : '',
                  )}
                >
                  {item.name}
                </motion.span>
              )}
            </AnimatePresence>
            {locked && !collapsed && (
              <Lock className="h-3 w-3 shrink-0 relative z-10 text-muted-foreground/40" />
            )}
          </>
        );

        if (locked) {
          return (
            <button
              type="button"
              key={item.name}
              onClick={() => onLockedClick(item.name)}
              className={baseClass}
              title={collapsed ? `${item.name} (locked)` : undefined}
            >
              {inner}
            </button>
          );
        }

        return (
          <Link
            key={item.name}
            href={item.href}
            className={baseClass}
            title={collapsed ? item.name : undefined}
          >
            {inner}
          </Link>
        );
      })}
    </div>
  );
}

export function Sidebar({ userRole }: { userRole?: string } = {}) {
  const pathname = usePathname();
  const { data: session } = useSession();
  const { collapsed, toggle } = useSidebarStore();
  const role = userRole || session?.user?.role;
  const isSuperAdmin = role === 'super_admin';
  const isWebmaster = role === 'webmaster';
  const { addons } = useDashboardAddons();
  const [lockedDialogFor, setLockedDialogFor] = useState<string | null>(null);

  return (
    <aside
      style={{ width: collapsed ? 64 : 256 }}
      className="fixed inset-y-0 left-0 z-50 bg-card border-r border-border/60 flex flex-col overflow-hidden transition-[width] duration-200 ease-out-expo"
    >
      {/* Logo */}
      <div className="h-14 flex items-center px-4 border-b border-border/60">
        <Link
          href={isWebmaster ? '/dashboard/time-tracking' : '/dashboard'}
          className="flex items-center gap-2.5 overflow-hidden"
        >
          <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-primary">
            <Building2 className="h-4 w-4 text-primary-foreground" />
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
                SPM Dashboard
              </motion.span>
            )}
          </AnimatePresence>
        </Link>
      </div>

      {/* Navigation */}
      <nav className="flex-1 overflow-y-auto px-2 py-3 space-y-3">
        {isWebmaster ? (
          <NavSection title="Work" items={webmasterWork} pathname={pathname} collapsed={collapsed} addons={addons} onLockedClick={setLockedDialogFor} />
        ) : (
          <>
            <NavSection title="Main" items={navigation} pathname={pathname} collapsed={collapsed} addons={addons} onLockedClick={setLockedDialogFor} />
            <NavSection title="Marketing" items={marketing} pathname={pathname} collapsed={collapsed} addons={addons} onLockedClick={setLockedDialogFor} />
            <NavSection title="Integrations" items={integrations} pathname={pathname} collapsed={collapsed} addons={addons} onLockedClick={setLockedDialogFor} />
            <NavSection title="Management" items={management} pathname={pathname} collapsed={collapsed} addons={addons} onLockedClick={setLockedDialogFor} />
            <NavSection title="Other" items={other} pathname={pathname} collapsed={collapsed} addons={addons} onLockedClick={setLockedDialogFor} />
          </>
        )}
      </nav>

      <LockedFeatureDialog
        open={lockedDialogFor !== null}
        onOpenChange={(open) => !open && setLockedDialogFor(null)}
        featureName={lockedDialogFor ?? ''}
      />

      {/* Admin Link for Super Admins */}
      {isSuperAdmin && (
        <div className="border-t border-border/60 px-2 py-2">
          <Link
            href="/admin"
            className={cn(
              'flex items-center gap-2.5 rounded-lg px-3 py-2 text-sm font-medium text-primary hover:bg-accent transition-colors',
              collapsed && 'justify-center px-2'
            )}
            title={collapsed ? 'Super Admin Panel' : undefined}
          >
            <Shield className="h-4 w-4 shrink-0" />
            <AnimatePresence>
              {!collapsed && (
                <motion.span
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  exit={{ opacity: 0 }}
                  transition={{ duration: 0.15 }}
                  className="whitespace-nowrap"
                >
                  Super Admin Panel
                </motion.span>
              )}
            </AnimatePresence>
          </Link>
        </div>
      )}

      {/* Collapse Toggle + Footer */}
      <div className="border-t border-border/60 px-2 py-2">
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
  );
}
