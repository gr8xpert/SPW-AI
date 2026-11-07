'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useSession } from 'next-auth/react';
import { Mail, RefreshCw, Users } from 'lucide-react';
import { AGENT_ROLE } from '@/lib/agent-access';
import { cn } from '@/lib/utils';
import { useCampaignsText } from '../_i18n';

const CAMPAIGNS = '/dashboard/campaigns';
const SUBSCRIBERS = '/dashboard/campaigns/subscribers';
const MAILERLITE = '/dashboard/campaigns/mailerlite';

// Email Campaigns tabs: the campaigns and the subscriber list they go to
// (the subscriber list was the old Contacts page until 2026-10-22), and the
// client's own MailerLite account (managers: agents can't change it).
export function CampaignsNav() {
  const pathname = usePathname();
  const t = useCampaignsText();
  const { data: session } = useSession();
  const items = [
    { href: CAMPAIGNS, label: t.nav.campaigns, icon: Mail },
    { href: SUBSCRIBERS, label: t.nav.subscribers, icon: Users },
    ...(session?.user?.role === AGENT_ROLE ? [] : [{ href: MAILERLITE, label: 'MailerLite', icon: RefreshCw }]),
  ];
  return (
    <nav className="flex flex-wrap items-center gap-1 border-b">
      {items.map(({ href, label, icon: Icon }) => {
        const active = href === CAMPAIGNS ? !pathname.startsWith(SUBSCRIBERS) && !pathname.startsWith(MAILERLITE) : pathname.startsWith(href);
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
          </Link>
        );
      })}
    </nav>
  );
}
