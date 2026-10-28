import { redirect } from 'next/navigation';
import { getCurrentSession } from '@/lib/server-session';
import { AGENT_HOME, AGENT_ROLE } from '@/lib/agent-access';
import { DashboardContent } from './dashboard-content';

export default async function DashboardPage() {
  const session = await getCurrentSession();

  if (session?.user?.role === 'webmaster') {
    redirect('/dashboard/time-tracking');
  }
  if (session?.user?.role === AGENT_ROLE) {
    redirect(AGENT_HOME);
  }

  return <DashboardContent />;
}
