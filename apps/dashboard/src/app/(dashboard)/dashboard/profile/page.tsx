'use client';

import { useSession } from 'next-auth/react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { TwoFactorCard } from './two-factor-card';
import { useProfileText } from './_i18n';

export default function ProfilePage() {
  const { data: session } = useSession();
  const t = useProfileText();
  return (
    <div className="max-w-3xl space-y-6 animate-fade-in">
      <div className="page-header">
        <div>
          <h1 className="page-title">{t.title}</h1>
          <p className="page-description mt-1">{t.description}</p>
        </div>
      </div>

      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-base">{t.account}</CardTitle>
        </CardHeader>
        <CardContent className="grid gap-1 text-sm sm:grid-cols-[120px_1fr]">
          <span className="text-muted-foreground">{t.name}</span>
          <span>{session?.user?.name || '—'}</span>
          <span className="text-muted-foreground">{t.email}</span>
          <span>{session?.user?.email}</span>
        </CardContent>
      </Card>

      <TwoFactorCard />
    </div>
  );
}
