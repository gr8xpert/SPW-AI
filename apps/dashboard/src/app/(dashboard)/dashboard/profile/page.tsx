'use client';

import { useSession } from 'next-auth/react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { TwoFactorCard } from './two-factor-card';

export default function ProfilePage() {
  const { data: session } = useSession();
  return (
    <div className="max-w-3xl space-y-6 animate-fade-in">
      <div className="page-header">
        <div>
          <h1 className="page-title">Profile & security</h1>
          <p className="page-description mt-1">Your account and how you log in</p>
        </div>
      </div>

      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-base">Account</CardTitle>
        </CardHeader>
        <CardContent className="grid gap-1 text-sm sm:grid-cols-[120px_1fr]">
          <span className="text-muted-foreground">Name</span>
          <span>{session?.user?.name || '—'}</span>
          <span className="text-muted-foreground">Email</span>
          <span>{session?.user?.email}</span>
        </CardContent>
      </Card>

      <TwoFactorCard />
    </div>
  );
}
