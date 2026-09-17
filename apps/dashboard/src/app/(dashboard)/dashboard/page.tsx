import { redirect } from 'next/navigation';
import { getCurrentSession } from '@/lib/server-session';
import { DashboardContent } from './dashboard-content';

export default async function DashboardPage() {
  const session = await getCurrentSession();

  if (session?.user?.role === 'webmaster') {
    redirect('/dashboard/time-tracking');
  }

  return <DashboardContent />;
}
