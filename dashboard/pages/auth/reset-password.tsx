import { useState, useEffect } from 'react';
import { useRouter } from 'next/router';
import Head from 'next/head';
import Link from 'next/link';
import { Mail, AlertCircle, CheckCircle, XCircle, Loader2 } from 'lucide-react';
import { getSupabaseBrowserClient } from '@/lib/supabase';
import { Button } from '@/components/ui/Button';
import { Input } from '@/components/ui/Input';
import { Card } from '@/components/ui/Card';

type PageState = 'loading' | 'ready' | 'invalid' | 'success';

export default function ResetPasswordPage() {
  const router = useRouter();
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [pageState, setPageState] = useState<PageState>('loading');

  useEffect(() => {
    const supabase = getSupabaseBrowserClient();
    let mounted = true;

    async function checkSession() {
      // Give a moment for session to be established from cookies
      await new Promise(resolve => setTimeout(resolve, 500));

      if (!mounted) return;

      const { data: { session } } = await supabase.auth.getSession();

      if (session) {
        setPageState('ready');
      } else {
        setPageState('invalid');
      }
    }

    checkSession();

    return () => {
      mounted = false;
    };
  }, []);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError(null);

    if (password !== confirmPassword) {
      setError('Passwords do not match');
      setLoading(false);
      return;
    }

    if (password.length < 8) {
      setError('Password must be at least 8 characters');
      setLoading(false);
      return;
    }

    try {
      const supabase = getSupabaseBrowserClient();

      const { error: updateError } = await supabase.auth.updateUser({
        password: password,
      });

      if (updateError) {
        setError(updateError.message);
        setLoading(false);
        return;
      }

      // Password updated successfully
      setPageState('success');

      // Sign out and redirect to signin
      await supabase.auth.signOut();

      setTimeout(() => {
        router.push('/auth/signin?message=password_reset');
      }, 2000);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'An error occurred');
      setLoading(false);
    }
  };

  // Loading state
  if (pageState === 'loading') {
    return (
      <>
        <Head>
          <title>Reset Password - AI Email Triage</title>
        </Head>
        <div className="min-h-screen flex items-center justify-center bg-slate-50 dark:bg-slate-900 p-6">
          <Card className="w-full max-w-md p-8">
            <div className="flex flex-col items-center gap-4 py-8">
              <Loader2 className="w-8 h-8 text-primary-600 animate-spin" />
              <p className="text-slate-500 dark:text-slate-400">Verifying session...</p>
            </div>
          </Card>
        </div>
      </>
    );
  }

  // Success state
  if (pageState === 'success') {
    return (
      <>
        <Head>
          <title>Password Reset - AI Email Triage</title>
        </Head>
        <div className="min-h-screen flex items-center justify-center bg-slate-50 dark:bg-slate-900 p-6">
          <Card className="w-full max-w-md p-8">
            <div className="flex justify-center mb-6">
              <div className="w-12 h-12 rounded-full bg-emerald-100 dark:bg-emerald-900/30 flex items-center justify-center">
                <CheckCircle className="w-6 h-6 text-emerald-600 dark:text-emerald-400" />
              </div>
            </div>
            <div className="text-center">
              <h1 className="text-2xl font-bold text-slate-900 dark:text-white mb-2">
                Password Reset!
              </h1>
              <p className="text-slate-500 dark:text-slate-400">
                Your password has been successfully updated. Redirecting to sign in...
              </p>
            </div>
          </Card>
        </div>
      </>
    );
  }

  // Invalid state
  if (pageState === 'invalid') {
    return (
      <>
        <Head>
          <title>Reset Password - AI Email Triage</title>
        </Head>
        <div className="min-h-screen flex items-center justify-center bg-slate-50 dark:bg-slate-900 p-6">
          <Card className="w-full max-w-md p-8">
            <div className="flex justify-center mb-6">
              <div className="w-12 h-12 rounded-full bg-red-100 dark:bg-red-900/30 flex items-center justify-center">
                <XCircle className="w-6 h-6 text-red-600 dark:text-red-400" />
              </div>
            </div>
            <div className="text-center mb-6">
              <h1 className="text-2xl font-bold text-slate-900 dark:text-white mb-2">
                Invalid Reset Link
              </h1>
              <p className="text-slate-500 dark:text-slate-400">
                This password reset link is invalid or has expired.
              </p>
            </div>
            <div className="space-y-3">
              <Link href="/auth/forgot-password">
                <Button className="w-full">Request New Reset Link</Button>
              </Link>
              <Link href="/auth/signin">
                <Button variant="secondary" className="w-full">Back to Sign In</Button>
              </Link>
            </div>
          </Card>
        </div>
      </>
    );
  }

  // Ready state - show form
  return (
    <>
      <Head>
        <title>Reset Password - AI Email Triage</title>
      </Head>

      <div className="min-h-screen flex items-center justify-center bg-slate-50 dark:bg-slate-900 p-6">
        <Card className="w-full max-w-md p-8">
          {/* Logo */}
          <div className="flex justify-center mb-8">
            <div className="w-12 h-12 rounded-xl bg-primary-600 flex items-center justify-center">
              <Mail className="w-6 h-6 text-white" />
            </div>
          </div>

          {/* Header */}
          <div className="text-center mb-8">
            <h1 className="text-2xl font-bold text-slate-900 dark:text-white mb-2">
              Reset Password
            </h1>
            <p className="text-slate-500 dark:text-slate-400">
              Enter your new password below
            </p>
          </div>

          <form onSubmit={handleSubmit} className="space-y-5">
            <Input
              label="New Password"
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="At least 8 characters"
              autoComplete="new-password"
              autoFocus
              required
            />

            <Input
              label="Confirm New Password"
              type="password"
              value={confirmPassword}
              onChange={(e) => setConfirmPassword(e.target.value)}
              placeholder="Confirm new password"
              autoComplete="new-password"
              required
            />

            {error && (
              <div className="flex items-start gap-2 p-3 rounded-lg bg-red-50 dark:bg-red-900/20 text-red-700 dark:text-red-400">
                <AlertCircle className="w-5 h-5 shrink-0 mt-0.5" />
                <span className="text-sm">{error}</span>
              </div>
            )}

            <Button type="submit" isLoading={loading} className="w-full">
              Reset Password
            </Button>
          </form>
        </Card>
      </div>
    </>
  );
}
