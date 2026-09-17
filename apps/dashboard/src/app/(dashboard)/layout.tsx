import { redirect } from 'next/navigation';
import { cookies } from 'next/headers';
import { getCurrentSession } from '@/lib/server-session';
import { Sidebar } from '@/components/layout/sidebar';
import { Header } from '@/components/layout/header';
import { DashboardShell } from '@/components/layout/dashboard-shell';
import { ImpersonationBanner } from '@/components/layout/impersonation-banner';
import { SuperAdminRedirectGuard } from '@/components/layout/super-admin-redirect-guard';

export default async function DashboardLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const session = await getCurrentSession();

  if (!session) {
    redirect('/login');
  }

  // Server-side check: super-admin visiting /dashboard directly should
  // bounce to /admin BEFORE any HTML is sent (no client-side flash of
  // the wrong layout). Skip the redirect when the impersonation cookie
  // is present — that means an operator is intentionally viewing the
  // client dashboard as part of an impersonation session.
  //
  // The cookie is a mirror of the localStorage sidecar written by
  // setImpersonationSession() in lib/impersonation.ts. localStorage
  // still holds the actual scoped JWT (sent as Bearer header); the
  // cookie is just a boolean flag the server can read.
  const isImpersonating = cookies().get('spm.impersonating')?.value === '1';
  if (session.user.role === 'super_admin' && !isImpersonating) {
    redirect('/admin');
  }

  const userRole = session.user.role as string;

  return (
    <div className="min-h-screen bg-background">
      {/* Belt-and-braces client-side guard: covers the edge case where
          the cookie was somehow lost but localStorage still says
          impersonating (e.g. a user tampered with cookies via devtools). */}
      <SuperAdminRedirectGuard />
      <ImpersonationBanner />
      <Sidebar userRole={userRole} />
      <DashboardShell>
        <Header />
        <main className="p-6 lg:p-8 page-gradient min-h-[calc(100vh-4rem)]">{children}</main>
      </DashboardShell>
    </div>
  );
}
