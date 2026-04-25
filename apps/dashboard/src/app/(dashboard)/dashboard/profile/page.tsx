'use client';

import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Construction } from 'lucide-react';

export default function ProfilePage() {
  return (
    <div className="space-y-6 animate-fade-in">
      <div className="page-header">
        <div>
          <h1 className="page-title">Profile</h1>
          <p className="page-description mt-1">
            Manage your account settings and preferences
          </p>
        </div>
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
            <li>Update your personal information</li>
            <li>Change your password</li>
            <li>Manage notification preferences</li>
          </ul>
        </CardContent>
      </Card>
    </div>
  );
}
