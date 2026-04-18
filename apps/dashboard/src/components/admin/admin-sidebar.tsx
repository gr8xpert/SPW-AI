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
  Key,
  Mail,
  Clock,
  ChevronLeft,
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
  { name: 'API Keys', href: '/admin/api-keys', icon: Key },
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
    <div className="space-y-1">
      <h3 className="px-3 text-xs font-semibold text-muted-foreground uppercase tracking-wider">
        {title}
      </h3>
      {items.map((item) => {
        const isActive = pathname === item.href || pathname.startsWith(item.href + '/');
        return (
          <Link
            key={item.name}
            href={item.href}
            className={cn(
              'flex items-center gap-3 rounded-md px-3 py-2 text-sm font-medium transition-colors',
              isActive
                ? 'bg-primary text-primary-foreground'
                : 'text-muted-foreground hover:bg-accent hover:text-accent-foreground'
            )}
          >
            <item.icon className="h-4 w-4" />
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
    <aside className="fixed inset-y-0 left-0 z-50 w-64 bg-card border-r flex flex-col">
      {/* Logo */}
      <div className="h-16 flex items-center px-6 border-b">
        <Link href="/admin" className="flex items-center gap-2">
          <Shield className="h-6 w-6 text-primary" />
          <span className="font-semibold text-lg">SPW Admin</span>
        </Link>
      </div>

      {/* Navigation */}
      <nav className="flex-1 overflow-y-auto p-4 space-y-6">
        <NavSection title="Main" items={navigation} pathname={pathname} />
        <NavSection title="Support" items={support} pathname={pathname} />
        <NavSection title="Billing" items={billing} pathname={pathname} />
        <NavSection title="System" items={system} pathname={pathname} />
      </nav>

      {/* Back to User Dashboard */}
      <div className="border-t p-4">
        <Link
          href="/dashboard"
          className="flex items-center gap-2 text-sm text-muted-foreground hover:text-foreground transition-colors"
        >
          <ChevronLeft className="h-4 w-4" />
          Back to Dashboard
        </Link>
      </div>
    </aside>
  );
}
