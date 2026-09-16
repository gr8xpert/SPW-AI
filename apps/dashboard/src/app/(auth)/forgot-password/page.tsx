'use client';

import { useState } from 'react';
import Link from 'next/link';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import * as z from 'zod';
import axios from 'axios';
import { ArrowLeft, MailCheck } from 'lucide-react';
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

const schema = z.object({
  email: z.string().email('Invalid email address'),
});

type ForgotForm = z.infer<typeof schema>;

export default function ForgotPasswordPage() {
  const [sentTo, setSentTo] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(false);

  const {
    register,
    handleSubmit,
    formState: { errors },
  } = useForm<ForgotForm>({ resolver: zodResolver(schema) });

  const onSubmit = async (data: ForgotForm) => {
    setIsLoading(true);
    setError(null);
    try {
      // Plain axios, not lib/api: the visitor has no session to attach. The
      // timeout guarantees the button can never spin forever, whatever the
      // mail server does.
      await axios.post(
        `${API_URL}/api/auth/forgot-password`,
        { email: data.email.trim() },
        { timeout: 45_000 },
      );
      setSentTo(data.email.trim());
    } catch (err) {
      if (!axios.isAxiosError(err)) {
        setError('Something went wrong. Please try again.');
      } else if (err.code === 'ECONNABORTED') {
        setError('The server took too long to respond. Please try again, or contact support.');
      } else if (err.response?.status === 429) {
        setError('Too many attempts. Please wait a few minutes and try again.');
      } else {
        // The API explains itself: no such account, deactivated, email failed.
        const message = err.response?.data?.message;
        setError(
          typeof message === 'string' ? message : 'Something went wrong. Please try again.',
        );
      }
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <Card className="shadow-lg border-border/60" hoverEffect={false}>
      <CardHeader className="space-y-1 pb-4">
        <div className="flex justify-center mb-2">
          <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-primary shadow-glow">
            <span className="text-lg font-bold text-primary-foreground">S</span>
          </div>
        </div>
        <CardTitle className="text-xl text-center">Reset your password</CardTitle>
        <CardDescription className="text-center">
          {sentTo
            ? 'Check your inbox'
            : "Enter your account email and we'll send you a reset link"}
        </CardDescription>
      </CardHeader>
      <CardContent>
        {sentTo ? (
          <div className="space-y-3 text-center animate-fade-in">
            <MailCheck className="h-10 w-10 mx-auto text-primary" />
            <p className="text-sm">
              We&apos;ve sent a reset link to <span className="font-medium">{sentTo}</span>. It
              expires in 1 hour.
            </p>
            <p className="text-xs text-muted-foreground">
              Nothing arrived? Check your spam folder, or contact support and we can reset it for
              you.
            </p>
          </div>
        ) : (
          <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="email" className="text-sm font-medium">Email</Label>
              <Input
                id="email"
                type="email"
                placeholder="Your email address"
                autoFocus
                {...register('email')}
                disabled={isLoading}
              />
              {errors.email && (
                <p className="text-sm text-destructive">{errors.email.message}</p>
              )}
            </div>
            {error && <p className="text-sm text-destructive">{error}</p>}
            <Button type="submit" className="w-full shadow-sm" loading={isLoading}>
              {isLoading ? 'Sending…' : 'Send reset link'}
            </Button>
          </form>
        )}
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
