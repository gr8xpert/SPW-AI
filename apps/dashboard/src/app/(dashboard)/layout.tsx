import { redirect } from 'next/navigation';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { Sidebar } from '@/components/layout/sidebar';
import { Header } from '@/components/layout/header';
import { DashboardShell } from '@/components/layout/dashboard-shell';
import { ImpersonationBanner } from '@/components/layout/impersonation-banner';

export default async function DashboardLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const session = await getServerSession(authOptions);

  if (!session) {
    redirect('/login');
  }

  // Super-admins are allowed to visit the dashboard directly. When they
  // do so via the impersonation flow, all API calls carry the impersonation
  // JWT (see useApi + lib/impersonation) so the dashboard renders as if the
  // client were logged in. Without impersonation, super-admin visits render
  // against their own tenant (typically empty) — harmless.
  const userRole = session.user.role as string;

  return (
    <div className="min-h-screen bg-background">
      <ImpersonationBanner />
      <Sidebar userRole={userRole} />
      <DashboardShell>
        <Header />
        <main className="p-6 lg:p-8 page-gradient min-h-[calc(100vh-4rem)]">{children}</main>
      </DashboardShell>
    </div>
  );
}
