import { redirect } from 'next/navigation';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { Sidebar } from '@/components/layout/sidebar';
import { Header } from '@/components/layout/header';
import { DashboardShell } from '@/components/layout/dashboard-shell';

export default async function DashboardLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const session = await getServerSession(authOptions);

  if (!session) {
    redirect('/login');
  }

  if (session.user.role === 'super_admin') {
    redirect('/admin');
  }

  const userRole = session.user.role as string;

  return (
    <div className="min-h-screen bg-background">
      <Sidebar userRole={userRole} />
      <DashboardShell>
        <Header />
        <main className="p-6 lg:p-8 page-gradient min-h-[calc(100vh-4rem)]">{children}</main>
      </DashboardShell>
    </div>
  );
}
