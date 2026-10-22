import type { Metadata } from 'next';
import { Inter } from 'next/font/google';
import '@/styles/globals.css';
import { Providers } from './providers';
import { getCurrentSession } from '@/lib/server-session';
import { toDashboardLanguage } from '@/i18n/languages';

const inter = Inter({ subsets: ['latin'] });

export const metadata: Metadata = {
  title: 'Smart Property Manager - Dashboard',
  description: 'Manage your property listings and real estate business',
};

export default async function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const session = await getCurrentSession();

  return (
    <html lang={toDashboardLanguage(session?.user?.dashboardLanguage)} suppressHydrationWarning>
      <body className={inter.className}>
        <Providers session={session}>{children}</Providers>
      </body>
    </html>
  );
}
