import { redirect } from 'next/navigation';
import { getCurrentSession } from '@/lib/server-session';

export default async function Home() {
  const session = await getCurrentSession();
  if (session?.user?.role === 'super_admin') {
    redirect('/admin');
  }
  redirect('/dashboard');
}
