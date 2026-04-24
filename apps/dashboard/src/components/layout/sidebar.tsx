'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useSession } from 'next-auth/react';
import { cn } from '@/lib/utils';
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
  ChevronDown,
  Shield,
  CreditCard,
  MessageSquare,
} from 'lucide-react';

const navigation = [
  { name: 'Dashboard', href: '/dashboard', icon: Home },
  { name: 'Properties', href: '/dashboard/properties', icon: Building2 },
  { name: 'Locations', href: '/dashboard/locations', icon: MapPin },
  { name: 'Property Types', href: '/dashboard/property-types', icon: Tag },
  { name: 'Features', href: '/dashboard/features', icon: Tag },
  { name: 'Labels', href: '/dashboard/labels', icon: Languages },
];

const marketing = [
  { name: 'Contacts', href: '/dashboard/contacts', icon: Users },
  { name: 'Leads', href: '/dashboard/leads', icon: UserCircle },
  { name: 'Email Campaigns', href: '/dashboard/campaigns', icon: Mail },
];

const integrations = [
  { name: 'Feed Sources', href: '/dashboard/feeds', icon: Upload },
  { name: 'Feed Export', href: '/dashboard/feed-export', icon: FileOutput },
];

const management = [
  { name: 'Team', href: '/dashboard/team', icon: Users },
];

const other = [
  { name: 'Analytics', href: '/dashboard/analytics', icon: BarChart3 },
  { name: 'AI Chat', href: '/dashboard/ai-chat', icon: MessageSquare },
  { name: 'Support Tickets', href: '/dashboard/tickets', icon: Ticket },
  { name: 'Billing', href: '/dashboard/billing', icon: CreditCard },
  { name: 'Settings', href: '/dashboard/settings', icon: Settings },
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

export function Sidebar() {
  const pathname = usePathname();
  const { data: session } = useSession();
  const isSuperAdmin = session?.user?.role === 'super_admin';

  return (
    <aside className="fixed inset-y-0 left-0 z-50 w-64 bg-card border-r flex flex-col">
      {/* Logo */}
      <div className="h-16 flex items-center px-6 border-b">
        <Link href="/dashboard" className="flex items-center gap-2">
          <Building2 className="h-6 w-6 text-primary" />
          <span className="font-semibold text-lg">SPW Dashboard</span>
        </Link>
      </div>

      {/* Navigation */}
      <nav className="flex-1 overflow-y-auto p-4 space-y-6">
        <NavSection title="Main" items={navigation} pathname={pathname} />
        <NavSection title="Marketing" items={marketing} pathname={pathname} />
        <NavSection title="Integrations" items={integrations} pathname={pathname} />
        <NavSection title="Management" items={management} pathname={pathname} />
        <NavSection title="Other" items={other} pathname={pathname} />
      </nav>

      {/* Admin Link for Super Admins */}
      {isSuperAdmin && (
        <div className="border-t p-4">
          <Link
            href="/admin"
            className="flex items-center gap-2 text-sm font-medium text-primary hover:underline"
          >
            <Shield className="h-4 w-4" />
            Super Admin Panel
          </Link>
        </div>
      )}

      {/* Footer */}
      <div className="border-t p-4">
        <p className="text-xs text-muted-foreground text-center">
          Smart Property Widget v2
        </p>
      </div>
    </aside>
  );
}
