import { redirect } from 'next/navigation';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { AdminSidebar } from '@/components/admin/admin-sidebar';
import { AdminHeader } from '@/components/admin/admin-header';
import { SessionGate } from '@/components/admin/session-gate';
import { AdminShell } from '@/components/admin/admin-shell';

export default async function AdminLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const session = await getServerSession(authOptions);

  if (!session) {
    redirect('/login');
  }

  if (session.user.role !== 'super_admin') {
    redirect('/dashboard');
  }

  return (
    <div className="min-h-screen bg-background">
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
