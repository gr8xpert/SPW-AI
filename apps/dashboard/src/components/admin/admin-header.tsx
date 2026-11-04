'use client';

import { useSession, signOut } from 'next-auth/react';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { Button } from '@/components/ui/button';
import { Avatar, AvatarFallback } from '@/components/ui/avatar';
import { Badge } from '@/components/ui/badge';
import { Bell, LogOut, Menu, Settings, User, Shield } from 'lucide-react';
import { getInitials } from '@/lib/utils';
import Link from 'next/link';
import { useAdminSidebarStore } from './admin-sidebar';

export function AdminHeader() {
  const { data: session } = useSession();
  const setMobileOpen = useAdminSidebarStore((s) => s.setMobileOpen);

  return (
    <header className="sticky top-0 z-40 h-14 border-b border-border/60 bg-card/80 backdrop-blur-sm flex items-center justify-between px-4 sm:px-6">
      <div className="flex items-center gap-2">
        <Button
          variant="ghost"
          size="icon"
          className="rounded-lg text-muted-foreground hover:text-foreground lg:hidden"
          onClick={() => setMobileOpen(true)}
          aria-label="Open menu"
          title="Open menu"
        >
          <Menu className="h-5 w-5" />
        </Button>
        <Badge variant="destructive" className="flex items-center gap-1.5 rounded-md px-2.5 py-1 text-[11px] font-semibold">
          <Shield className="h-3 w-3" />
          Super Admin
        </Badge>
      </div>

      <div className="flex items-center gap-1 sm:gap-2">
        <Button variant="ghost" size="icon" className="relative rounded-lg text-muted-foreground hover:text-foreground">
          <Bell className="h-[18px] w-[18px]" />
        </Button>

        <div className="mx-1 hidden h-6 w-px bg-border/60 sm:block" />

        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button variant="ghost" className="relative h-9 w-9 rounded-full">
              <Avatar className="h-9 w-9">
                <AvatarFallback className="bg-primary/10 text-primary text-xs font-semibold">
                  {session?.user?.name ? getInitials(session.user.name) : 'U'}
                </AvatarFallback>
              </Avatar>
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent className="w-56" align="end" forceMount>
            <DropdownMenuLabel className="font-normal">
              <div className="flex flex-col space-y-1">
                <p className="text-sm font-medium leading-none">
                  {session?.user?.name || 'User'}
                </p>
                <p className="text-xs leading-none text-muted-foreground">
                  {session?.user?.email}
                </p>
              </div>
            </DropdownMenuLabel>
            <DropdownMenuSeparator />
            <DropdownMenuItem asChild>
              <Link href="/dashboard/profile">
                <User className="mr-2 h-4 w-4" />
                Profile
              </Link>
            </DropdownMenuItem>
            <DropdownMenuItem asChild>
              <Link href="/dashboard/settings">
                <Settings className="mr-2 h-4 w-4" />
                Settings
              </Link>
            </DropdownMenuItem>
            <DropdownMenuSeparator />
            <DropdownMenuItem
              className="text-destructive focus:text-destructive"
              onClick={() => signOut({ callbackUrl: '/login' })}
            >
              <LogOut className="mr-2 h-4 w-4" />
              Log out
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>
    </header>
  );
}
