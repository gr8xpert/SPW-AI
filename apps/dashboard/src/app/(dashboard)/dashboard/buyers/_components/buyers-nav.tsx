'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useSession } from 'next-auth/react';
import { BarChart3, Bell, CalendarCheck, Kanban, Settings, Sun, Upload, Users } from 'lucide-react';
import { cn } from '@/lib/utils';
import { useBuyerText } from '../_i18n/use-buyer-text';
import { useBuyerAlerts } from '../use-buyer-match';

// The Buyers section's own tabs (one sidebar item, five pages; Import is
// for managers only).
const MANAGER_ROLES = new Set(['admin', 'webmaster', 'super_admin']);

export function BuyersNav() {
  const t = useBuyerText();
  const pathname = usePathname();
  const { data: session } = useSession();
  const manager = MANAGER_ROLES.has(String(session?.user?.role ?? ''));
  const pending = useBuyerAlerts('pending', 1).data?.pendingCount ?? 0;
  const items = [
    { href: '/dashboard/buyers/home', label: t.nav.home, icon: Sun },
    { href: '/dashboard/buyers', label: t.nav.list, icon: Users, exact: true },
    { href: '/dashboard/buyers/board', label: t.nav.board, icon: Kanban },
    { href: '/dashboard/buyers/today', label: t.nav.today, icon: CalendarCheck },
    { href: '/dashboard/buyers/alerts', label: t.nav.alerts, icon: Bell, count: pending },
    ...(manager ? [{ href: '/dashboard/buyers/reports', label: t.nav.reports, icon: BarChart3 }] : []),
    { href: '/dashboard/buyers/settings', label: t.nav.settings, icon: Settings },
    ...(manager ? [{ href: '/dashboard/buyers/import', label: t.nav.import, icon: Upload }] : []),
  ];
  return (
    <nav className="flex flex-wrap gap-1 border-b">
      {items.map(({ href, label, icon: Icon, exact, count }: { href: string; label: string; icon: typeof Users; exact?: boolean; count?: number }) => {
        const active = exact ? pathname === href : pathname.startsWith(href);
        return (
          <Link
            key={href}
            href={href}
            className={cn(
              '-mb-px flex items-center gap-1.5 border-b-2 px-3 py-2 text-sm transition-colors',
              active ? 'border-primary font-medium text-foreground' : 'border-transparent text-muted-foreground hover:text-foreground',
            )}
          >
            <Icon className="h-4 w-4" />
            {label}
            {count ? (
              <span className="ml-0.5 rounded-full bg-primary px-1.5 text-[10px] font-semibold leading-4 text-primary-foreground" data-testid="alerts-count">
                {count}
              </span>
            ) : null}
          </Link>
        );
      })}
    </nav>
  );
}
