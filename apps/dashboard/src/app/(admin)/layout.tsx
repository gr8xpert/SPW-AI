import { redirect } from 'next/navigation';
import { getCurrentSession } from '@/lib/server-session';
import { AdminSidebar } from '@/components/admin/admin-sidebar';
import { AdminHeader } from '@/components/admin/admin-header';
import { SessionGate } from '@/components/admin/session-gate';
import { AdminShell } from '@/components/admin/admin-shell';
import { ImpersonationBanner } from '@/components/layout/impersonation-banner';

export default async function AdminLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const session = await getCurrentSession();

  if (!session) {
    redirect('/login');
  }

  if (session.user.role !== 'super_admin') {
    redirect('/dashboard');
  }

  return (
    <div className="min-h-screen bg-background">
      <ImpersonationBanner />
      <AdminSidebar />
      <AdminShell>
        <AdminHeader />
        <main className="p-6 lg:p-8 page-gradient min-h-[calc(100vh-4rem)]">
          <SessionGate>{children}</SessionGate>
        </main>
      </AdminShell>
    </div>
  );
}
