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
  Timer,
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

const webmasterWork = [
  { name: 'Time Tracking', href: '/dashboard/time-tracking', icon: Timer },
  { name: 'Assigned Tickets', href: '/dashboard/tickets', icon: Ticket },
];

export function Sidebar({ userRole }: { userRole?: string } = {}) {
  const pathname = usePathname();
  const { data: session } = useSession();
  const role = userRole || session?.user?.role;
  const isSuperAdmin = role === 'super_admin';
  const isWebmaster = role === 'webmaster';

  return (
    <aside className="fixed inset-y-0 left-0 z-50 w-64 bg-card border-r border-border/60 flex flex-col">
      {/* Logo */}
      <div className="h-16 flex items-center px-6 border-b border-border/60">
        <Link href={isWebmaster ? '/dashboard/time-tracking' : '/dashboard'} className="flex items-center gap-2.5">
          <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-primary">
            <Building2 className="h-4 w-4 text-primary-foreground" />
          </div>
          <span className="font-semibold text-base tracking-tight">SPW Dashboard</span>
        </Link>
      </div>

      {/* Navigation */}
      <nav className="flex-1 overflow-y-auto px-3 py-4 space-y-5">
        {isWebmaster ? (
          <NavSection title="Work" items={webmasterWork} pathname={pathname} />
        ) : (
          <>
            <NavSection title="Main" items={navigation} pathname={pathname} />
            <NavSection title="Marketing" items={marketing} pathname={pathname} />
            <NavSection title="Integrations" items={integrations} pathname={pathname} />
            <NavSection title="Management" items={management} pathname={pathname} />
            <NavSection title="Other" items={other} pathname={pathname} />
          </>
        )}
      </nav>

      {/* Admin Link for Super Admins */}
      {isSuperAdmin && (
        <div className="border-t border-border/60 px-3 py-3">
          <Link
            href="/admin"
            className="flex items-center gap-2.5 rounded-lg px-3 py-2 text-sm font-medium text-primary hover:bg-accent transition-colors"
          >
            <Shield className="h-4 w-4" />
            Super Admin Panel
          </Link>
        </div>
      )}

      {/* Footer */}
      <div className="border-t border-border/60 px-4 py-3">
        <p className="text-[11px] text-muted-foreground/60 text-center">
          Smart Property Widget v2
        </p>
      </div>
    </aside>
  );
}
