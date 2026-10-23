'use client';

import { useEffect, useState, Suspense } from 'react';
import { signIn, getSession } from 'next-auth/react';
import { useRouter, useSearchParams } from 'next/navigation';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import * as z from 'zod';
import Link from 'next/link';
import { motion } from 'framer-motion';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';
import { useToast } from '@/hooks/use-toast';
import { Shimmer } from '@/components/ui/shimmer';

const loginSchema = z.object({
  email: z.string().email('Invalid email address'),
  password: z.string().min(8, 'Password must be at least 8 characters'),
});

type LoginForm = z.infer<typeof loginSchema>;

function getSafeCallbackUrl(url: string | null): string {
  const defaultUrl = '/dashboard';
  if (!url) return defaultUrl;
  if (
    !url.startsWith('/') ||
    url.startsWith('//') ||
    url.startsWith('/\\') ||
    url.includes(':')
  ) {
    return defaultUrl;
  }
  return url;
}

function LoginForm() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const callbackUrl = getSafeCallbackUrl(searchParams.get('callbackUrl'));
  const { toast } = useToast();
  const [isLoading, setIsLoading] = useState(false);
  const [shake, setShake] = useState(false);
  // Two-factor step: the password was right, now the code from the app.
  const [needCode, setNeedCode] = useState(false);
  const [code, setCode] = useState('');
  // Until React runs, a click would submit the plain HTML form: keep Sign in off till then.
  const [mounted, setMounted] = useState(false);
  useEffect(() => { setMounted(true); }, []);

  // Old bookmarks / history from the pre-hydration GET bug may carry credentials
  // in the address: drop them from the URL at once, never use them.
  useEffect(() => {
    if (!searchParams.has('password') && !searchParams.has('email')) return;
    const rest = new URLSearchParams(searchParams.toString());
    rest.delete('password');
    rest.delete('email');
    const qs = rest.toString();
    router.replace(qs ? `/login?${qs}` : '/login');
  }, [searchParams, router]);

  const {
    register,
    handleSubmit,
    formState: { errors },
  } = useForm<LoginForm>({
    resolver: zodResolver(loginSchema),
  });

  const onSubmit = async (data: LoginForm) => {
    setIsLoading(true);

    try {
      const result = await signIn('credentials', {
        email: data.email,
        password: data.password,
        ...(needCode ? { code: code.trim() } : {}),
        redirect: false,
        // Without an explicit callbackUrl next-auth uses the current address,
        // and it reads `?error=` from the URL it hands back. Landing on
        // /login?error=... (next-auth sends users there after a session error)
        // therefore reported a SUCCESSFUL sign-in as "Invalid email or
        // password" while the session was actually created.
        callbackUrl,
      });

      if (result?.error === 'TWO_FACTOR_REQUIRED') {
        setNeedCode(true);
      } else if (result?.error) {
        setShake(true);
        setTimeout(() => setShake(false), 500);
        toast({
          title: 'Login failed',
          description:
            result.error === 'TWO_FACTOR_INVALID'
              ? 'That code is not right. Use the newest code from your app, or a recovery code.'
              : result.error === 'TWO_FACTOR_LOCKED'
                ? 'Too many wrong codes. Try again in 15 minutes.'
                : 'Invalid email or password',
          variant: 'destructive',
        });
        if (result.error === 'TWO_FACTOR_INVALID') setCode('');
      } else {
        const session = await getSession();
        const role = session?.user?.role;
        const target = session?.user?.mfaSetup
          ? '/dashboard/profile'
          : role === 'super_admin' ? '/admin' : role === 'webmaster' ? '/dashboard/time-tracking' : callbackUrl;
        router.push(target);
        router.refresh();
      }
    } catch (error) {
      toast({
        title: 'Error',
        description: 'Something went wrong. Please try again.',
        variant: 'destructive',
      });
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <motion.div
      animate={shake ? { x: [0, -4, 4, -4, 4, 0] } : {}}
      transition={{ duration: 0.4 }}
    >
      <Card className="shadow-lg border-border/60" hoverEffect={false}>
        <CardHeader className="space-y-1 pb-4">
          <div className="flex justify-center mb-2 animate-fade-in">
            <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-primary shadow-glow">
              <span className="text-lg font-bold text-primary-foreground">S</span>
            </div>
          </div>
          <CardTitle className="text-xl text-center">Welcome back</CardTitle>
          <CardDescription className="text-center">
            Sign in to your account to continue
          </CardDescription>
        </CardHeader>
        <CardContent>
          {/* method="post" + action="#": even a submit before hydration can never put the password in a URL. */}
          <form method="post" action="#" onSubmit={handleSubmit(onSubmit)} className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="email" className="text-sm font-medium">Email</Label>
              <Input
                id="email"
                type="email"
                placeholder="Your email address"
                {...register('email')}
                disabled={isLoading}
                className="transition-shadow duration-200 focus:shadow-glow"
              />
              {errors.email && (
                <p className="text-sm text-destructive animate-fade-in">
                  {errors.email.message}
                </p>
              )}
            </div>
            <div className="space-y-2">
              <Label htmlFor="password" className="text-sm font-medium">Password</Label>
              <Input
                id="password"
                type="password"
                placeholder="Enter your password"
                {...register('password')}
                disabled={isLoading}
                className="transition-shadow duration-200 focus:shadow-glow"
              />
              {errors.password && (
                <p className="text-sm text-destructive animate-fade-in">
                  {errors.password.message}
                </p>
              )}
            </div>
            {needCode ? (
              <div className="space-y-2 animate-fade-in" data-testid="two-factor-step">
                <Label htmlFor="code" className="text-sm font-medium">Two-factor code</Label>
                <Input
                  id="code"
                  inputMode="numeric"
                  autoComplete="one-time-code"
                  autoFocus
                  placeholder="6-digit code"
                  value={code}
                  maxLength={20}
                  onChange={(e) => setCode(e.target.value)}
                  disabled={isLoading}
                />
                <p className="text-xs text-muted-foreground">
                  Open your authenticator app and type the code for SPM Dashboard. Lost your phone? Type one of your recovery codes.
                </p>
              </div>
            ) : null}
            <div>
              <Button type="submit" className="w-full shadow-sm" loading={isLoading} disabled={!mounted || (needCode && code.trim().length < 6)}>
                {isLoading ? 'Signing in...' : 'Sign in'}
              </Button>
            </div>
          </form>
        </CardContent>
        <CardFooter className="flex flex-col space-y-2">
          <div className="text-sm text-muted-foreground text-center">
            <Link
              href="/forgot-password"
              className="hover:text-primary underline-offset-4 hover:underline transition-colors"
            >
              Forgot your password?
            </Link>
          </div>
        </CardFooter>
      </Card>
    </motion.div>
  );
}

function LoginFormSkeleton() {
  return (
    <Card hoverEffect={false}>
      <CardHeader className="space-y-1">
        <CardTitle className="text-2xl text-center">Welcome back</CardTitle>
        <CardDescription className="text-center">
          Sign in to your account to continue
        </CardDescription>
      </CardHeader>
      <CardContent>
        <div className="space-y-4">
          <div className="space-y-2">
            <Shimmer className="h-4 w-12" />
            <Shimmer className="h-10 w-full" />
          </div>
          <div className="space-y-2">
            <Shimmer className="h-4 w-16" />
            <Shimmer className="h-10 w-full" />
          </div>
          <Shimmer className="h-10 w-full" />
        </div>
      </CardContent>
    </Card>
  );
}

export default function LoginPage() {
  return (
    <Suspense fallback={<LoginFormSkeleton />}>
      <LoginForm />
    </Suspense>
  );
}
