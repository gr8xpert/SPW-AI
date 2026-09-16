'use client';

import { Suspense, useState } from 'react';
import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import * as z from 'zod';
import axios from 'axios';
import { ArrowLeft, CheckCircle2 } from 'lucide-react';
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

const API_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3001';

const schema = z
  .object({
    password: z.string().min(8, 'Password must be at least 8 characters').max(128),
    confirm: z.string(),
  })
  .refine((v) => v.password === v.confirm, {
    message: 'Passwords do not match',
    path: ['confirm'],
  });

type ResetForm = z.infer<typeof schema>;

function ResetPasswordForm() {
  const router = useRouter();
  const token = useSearchParams().get('token') ?? '';
  const [done, setDone] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(false);

  const {
    register,
    handleSubmit,
    formState: { errors },
  } = useForm<ResetForm>({ resolver: zodResolver(schema) });

  const onSubmit = async (data: ResetForm) => {
    setIsLoading(true);
    setError(null);
    try {
      await axios.post(`${API_URL}/api/auth/reset-password`, {
        token,
        password: data.password,
      });
      setDone(true);
      setTimeout(() => router.push('/login'), 2500);
    } catch (err) {
      const message = axios.isAxiosError(err) ? err.response?.data?.message : undefined;
      setError(
        typeof message === 'string'
          ? message
          : 'This reset link is invalid or has expired. Please request a new one.',
      );
    } finally {
      setIsLoading(false);
    }
  };

  if (!token) {
    return (
      <div className="space-y-3 text-center">
        <p className="text-sm">This reset link is incomplete.</p>
        <Button asChild variant="outline">
          <Link href="/forgot-password">Request a new link</Link>
        </Button>
      </div>
    );
  }

  if (done) {
    return (
      <div className="space-y-3 text-center animate-fade-in">
        <CheckCircle2 className="h-10 w-10 mx-auto text-primary" />
        <p className="text-sm">Your password has been changed. Redirecting you to sign in…</p>
      </div>
    );
  }

  return (
    <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
      <div className="space-y-2">
        <Label htmlFor="password" className="text-sm font-medium">New password</Label>
        <Input
          id="password"
          type="password"
          autoComplete="new-password"
          autoFocus
          {...register('password')}
          disabled={isLoading}
        />
        {errors.password && (
          <p className="text-sm text-destructive">{errors.password.message}</p>
        )}
      </div>
      <div className="space-y-2">
        <Label htmlFor="confirm" className="text-sm font-medium">Confirm new password</Label>
        <Input
          id="confirm"
          type="password"
          autoComplete="new-password"
          {...register('confirm')}
          disabled={isLoading}
        />
        {errors.confirm && (
          <p className="text-sm text-destructive">{errors.confirm.message}</p>
        )}
      </div>
      {error && (
        <div className="space-y-1">
          <p className="text-sm text-destructive">{error}</p>
          <Link href="/forgot-password" className="text-sm text-primary hover:underline">
            Request a new link
          </Link>
        </div>
      )}
      <Button type="submit" className="w-full shadow-sm" loading={isLoading}>
        {isLoading ? 'Saving…' : 'Set new password'}
      </Button>
    </form>
  );
}

export default function ResetPasswordPage() {
  return (
    <Card className="shadow-lg border-border/60" hoverEffect={false}>
      <CardHeader className="space-y-1 pb-4">
        <div className="flex justify-center mb-2">
          <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-primary shadow-glow">
            <span className="text-lg font-bold text-primary-foreground">S</span>
          </div>
        </div>
        <CardTitle className="text-xl text-center">Choose a new password</CardTitle>
        <CardDescription className="text-center">
          You&apos;ll be signed out of any other devices
        </CardDescription>
      </CardHeader>
      <CardContent>
        <Suspense fallback={null}>
          <ResetPasswordForm />
        </Suspense>
      </CardContent>
      <CardFooter className="justify-center">
        <Link
          href="/login"
          className="text-sm text-muted-foreground hover:text-primary inline-flex items-center gap-1 transition-colors"
        >
          <ArrowLeft className="h-3.5 w-3.5" />
          Back to sign in
        </Link>
      </CardFooter>
    </Card>
  );
}
