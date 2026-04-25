'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { cn } from '@/lib/utils';
import {
  Shield,
  Home,
  Users,
  CreditCard,
  Ticket,
  FileText,
  Settings,
  BarChart3,
  Mail,
  Clock,
  Gauge,
  Layers,
} from 'lucide-react';

const navigation = [
  { name: 'Dashboard', href: '/admin', icon: Home },
  { name: 'Clients', href: '/admin/clients', icon: Users },
  { name: 'Plans', href: '/admin/plans', icon: CreditCard },
];

const support = [
  { name: 'All Tickets', href: '/admin/tickets', icon: Ticket },
  { name: 'Webmasters', href: '/admin/webmasters', icon: Clock },
];

const billing = [
  { name: 'Credits', href: '/admin/credits', icon: CreditCard },
  { name: 'Subscriptions', href: '/admin/subscriptions', icon: FileText },
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
}: {
  title: string;
  items: typeof navigation;
  pathname: string;
}) {
  return (
    <div className="space-y-0.5">
      <h3 className="mb-2 px-3 text-[11px] font-semibold text-muted-foreground/70 uppercase tracking-widest">
        {title}
      </h3>
      {items.map((item) => {
        const isActive = pathname === item.href || pathname.startsWith(item.href + '/');
        return (
          <Link
            key={item.name}
            href={item.href}
            className={cn(
              'group flex items-center gap-3 rounded-lg px-3 py-2 text-sm font-medium transition-all duration-150',
              isActive
                ? 'bg-primary text-primary-foreground shadow-sm'
                : 'text-muted-foreground hover:bg-accent hover:text-foreground'
            )}
          >
            <item.icon className={cn('h-4 w-4 shrink-0', !isActive && 'text-muted-foreground/70 group-hover:text-foreground')} />
            {item.name}
          </Link>
        );
      })}
    </div>
  );
}

export function AdminSidebar() {
  const pathname = usePathname();

  return (
    <aside className="fixed inset-y-0 left-0 z-50 w-64 bg-card border-r border-border/60 flex flex-col">
      {/* Logo */}
      <div className="h-16 flex items-center px-6 border-b border-border/60">
        <Link href="/admin" className="flex items-center gap-2.5">
          <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-primary">
            <Shield className="h-4 w-4 text-primary-foreground" />
          </div>
          <span className="font-semibold text-base tracking-tight">SPW Admin</span>
        </Link>
      </div>

      {/* Navigation */}
      <nav className="flex-1 overflow-y-auto px-3 py-4 space-y-5">
        <NavSection title="Main" items={navigation} pathname={pathname} />
        <NavSection title="Support" items={support} pathname={pathname} />
        <NavSection title="Billing" items={billing} pathname={pathname} />
        <NavSection title="System" items={system} pathname={pathname} />
      </nav>

      {/* Footer */}
      <div className="border-t border-border/60 px-4 py-3">
        <p className="text-[11px] text-muted-foreground/60 text-center">
          Smart Property Widget v2
        </p>
      </div>
    </aside>
  );
}
