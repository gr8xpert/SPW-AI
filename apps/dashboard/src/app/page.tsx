import { redirect } from 'next/navigation';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';

export default async function Home() {
  const session = await getServerSession(authOptions);
  if (session?.user?.role === 'super_admin') {
    redirect('/admin');
  }
  redirect('/dashboard');
}
