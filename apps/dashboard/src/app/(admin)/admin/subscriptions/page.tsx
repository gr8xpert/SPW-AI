'use client';

import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Construction } from 'lucide-react';

export default function SubscriptionsPage() {
  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-bold tracking-tight">Subscriptions</h1>
        <p className="text-muted-foreground">
          Manage client subscriptions and billing
        </p>
      </div>

      <Card>
        <CardHeader className="text-center">
          <Construction className="h-16 w-16 mx-auto text-muted-foreground mb-4" />
          <CardTitle>Coming Soon</CardTitle>
          <CardDescription>
            This feature is currently under development. Check back soon!
          </CardDescription>
        </CardHeader>
        <CardContent className="text-center text-sm text-muted-foreground">
          <p>You will be able to:</p>
          <ul className="mt-2 space-y-1">
            <li>View all active subscriptions</li>
            <li>Manage subscription plans and pricing</li>
            <li>Handle renewals and cancellations</li>
          </ul>
        </CardContent>
      </Card>
    </div>
  );
}
