import { redirect } from 'next/navigation';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { DashboardContent } from './dashboard-content';

export default async function DashboardPage() {
  const session = await getServerSession(authOptions);

  if (session?.user?.role === 'webmaster') {
    redirect('/dashboard/time-tracking');
  }

  return <DashboardContent />;
}
