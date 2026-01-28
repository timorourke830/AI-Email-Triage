import { useState, useEffect } from 'react';
import { useRouter } from 'next/router';
import Head from 'next/head';
import Link from 'next/link';
import { Mail, AlertCircle, CheckCircle } from 'lucide-react';
import { getSupabaseBrowserClient } from '@/lib/supabase';
import { Button } from '@/components/ui/Button';
import { Input } from '@/components/ui/Input';
import { Card } from '@/components/ui/Card';

export default function SignInPage() {
  const router = useRouter();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);

  // Check for success message from password reset
  useEffect(() => {
    if (router.query.message === 'password_reset') {
      setSuccessMessage('Password reset successful! Please sign in with your new password.');
    }
  }, [router.query]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError(null);

    try {
      console.log('[SignIn] Getting Supabase client...');
      const supabase = getSupabaseBrowserClient();

      console.log('[SignIn] Attempting sign in for:', email);
      const { data, error: signInError } = await supabase.auth.signInWithPassword({
        email,
        password,
      });

      console.log('[SignIn] Response:', {
        hasData: !!data,
        hasSession: !!data?.session,
        hasError: !!signInError,
        errorMessage: signInError?.message,
      });

      if (signInError) {
        setError(signInError.message);
        setLoading(false);
        return;
      }

      // Redirect to home - _app.tsx will handle routing to setup if needed
      router.push('/');
    } catch (err) {
      console.error('[SignIn] Exception caught:', err);
      console.error('[SignIn] Error type:', err?.constructor?.name);
      console.error('[SignIn] Error message:', err instanceof Error ? err.message : String(err));

      // Handle network errors specifically
      if (err instanceof Error) {
        if (err.message.includes('fetch') || err.message.includes('network') || err.message.includes('Failed to fetch')) {
          setError('Unable to connect to authentication service. Please check your internet connection and try again.');
        } else {
          setError(err.message);
        }
      } else {
        setError('An unexpected error occurred. Please try again.');
      }
      setLoading(false);
    }
  };

  return (
    <>
      <Head>
        <title>Sign In - AI Email Triage</title>
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
              Welcome back
            </h1>
            <p className="text-slate-500 dark:text-slate-400">
              Sign in to AI Email Triage
            </p>
          </div>

          <form onSubmit={handleSubmit} className="space-y-5">
            <Input
              label="Email"
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="you@example.com"
              autoComplete="email"
              required
            />

            <Input
              label="Password"
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="Enter your password"
              autoComplete="current-password"
              required
            />

            {successMessage && (
              <div className="flex items-start gap-2 p-3 rounded-lg bg-emerald-50 dark:bg-emerald-900/20 text-emerald-700 dark:text-emerald-400">
                <CheckCircle className="w-5 h-5 shrink-0 mt-0.5" />
                <span className="text-sm">{successMessage}</span>
              </div>
            )}

            {error && (
              <div className="flex items-start gap-2 p-3 rounded-lg bg-red-50 dark:bg-red-900/20 text-red-700 dark:text-red-400">
                <AlertCircle className="w-5 h-5 shrink-0 mt-0.5" />
                <span className="text-sm">{error}</span>
              </div>
            )}

            <Button type="submit" isLoading={loading} className="w-full">
              Sign In
            </Button>
          </form>

          <div className="mt-4 text-center">
            <Link
              href="/auth/forgot-password"
              className="text-sm text-slate-500 dark:text-slate-400 hover:text-primary-600 dark:hover:text-primary-400"
            >
              Forgot password?
            </Link>
          </div>

          <div className="mt-8 pt-6 border-t border-slate-200 dark:border-slate-700 text-center">
            <p className="text-sm text-slate-500 dark:text-slate-400">
              Don&apos;t have an account?{' '}
              <Link
                href="/auth/signup"
                className="font-medium text-primary-600 hover:text-primary-700 dark:text-primary-400"
              >
                Sign up
              </Link>
            </p>
          </div>
        </Card>
      </div>
    </>
  );
}
