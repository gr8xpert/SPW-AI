'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { Mail, Users } from 'lucide-react';
import { cn } from '@/lib/utils';
import { useCampaignsText } from '../_i18n';

// Email Campaigns tabs: the campaigns and the subscriber list they go to
// (the subscriber list was the old Contacts page until 2026-10-22).
const ITEMS = [
  { href: '/dashboard/campaigns', key: 'campaigns' as const, icon: Mail },
  { href: '/dashboard/campaigns/subscribers', key: 'subscribers' as const, icon: Users },
];

export function CampaignsNav() {
  const pathname = usePathname();
  const t = useCampaignsText();
  return (
    <nav className="flex flex-wrap items-center gap-1 border-b">
      {ITEMS.map(({ href, key, icon: Icon }) => {
        const active = href === '/dashboard/campaigns' ? !pathname.startsWith('/dashboard/campaigns/subscribers') : pathname.startsWith(href);
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
            {t.nav[key]}
          </Link>
        );
      })}
    </nav>
  );
}
