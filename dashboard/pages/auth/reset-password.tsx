import { useState, useEffect } from 'react';
import { useRouter } from 'next/router';
import Head from 'next/head';
import Link from 'next/link';
import { getSupabaseBrowserClient } from '@/lib/supabase';

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

    // Listen for the PASSWORD_RECOVERY event from Supabase
    // This fires when Supabase processes the reset token from the URL hash
    const { data: { subscription } } = supabase.auth.onAuthStateChange((event, session) => {
      console.log('[Reset Password] Auth event:', event);

      if (event === 'PASSWORD_RECOVERY') {
        // Supabase has validated the recovery token
        // User can now set a new password
        setPageState('ready');
      } else if (event === 'SIGNED_IN' && session) {
        // Sometimes SIGNED_IN fires instead of PASSWORD_RECOVERY
        // Check if we're on this page with a recovery flow
        setPageState('ready');
      } else if (event === 'SIGNED_OUT') {
        // User was signed out, likely invalid/expired token
        setPageState('invalid');
      }
    });

    // Also check if there's already a session (in case event already fired)
    const checkSession = async () => {
      const { data: { session } } = await supabase.auth.getSession();

      if (session) {
        // There's an active session, allow password reset
        setPageState('ready');
      } else {
        // No session - wait a bit for Supabase to process URL hash
        // If no session after timeout, show error
        setTimeout(() => {
          setPageState((current) => current === 'loading' ? 'invalid' : current);
        }, 2000);
      }
    };

    checkSession();

    return () => {
      subscription.unsubscribe();
    };
  }, []);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError(null);

    // Validate passwords match
    if (password !== confirmPassword) {
      setError('Passwords do not match');
      setLoading(false);
      return;
    }

    // Validate password strength
    if (password.length < 6) {
      setError('Password must be at least 6 characters');
      setLoading(false);
      return;
    }

    try {
      const supabase = getSupabaseBrowserClient();

      // Update the user's password
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

      // Sign out to ensure clean state, then redirect to sign in
      await supabase.auth.signOut();

      // Redirect after a brief delay to show success message
      setTimeout(() => {
        router.push('/auth/signin?message=password_reset');
      }, 2000);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'An error occurred');
      setLoading(false);
    }
  };

  // Loading state while checking for valid recovery session
  if (pageState === 'loading') {
    return (
      <>
        <Head>
          <title>Reset Password - AI Email Triage</title>
        </Head>
        <div style={styles.container}>
          <div style={styles.card}>
            <div style={styles.loading}>
              <div style={styles.spinner}></div>
              <p>Verifying reset link...</p>
            </div>
          </div>
        </div>
      </>
    );
  }

  // Success state after password reset
  if (pageState === 'success') {
    return (
      <>
        <Head>
          <title>Password Reset - AI Email Triage</title>
        </Head>
        <div style={styles.container}>
          <div style={styles.card}>
            <div style={styles.header}>
              <div style={styles.iconSuccess}>&#10003;</div>
              <h1 style={styles.title}>Password Reset!</h1>
              <p style={styles.subtitle}>
                Your password has been successfully updated.
                Redirecting to sign in...
              </p>
            </div>
          </div>
        </div>
      </>
    );
  }

  // Invalid/expired link state
  if (pageState === 'invalid') {
    return (
      <>
        <Head>
          <title>Reset Password - AI Email Triage</title>
        </Head>
        <div style={styles.container}>
          <div style={styles.card}>
            <div style={styles.header}>
              <div style={styles.iconError}>!</div>
              <h1 style={styles.title}>Invalid Reset Link</h1>
              <p style={styles.subtitle}>
                This password reset link is invalid or has expired.
              </p>
            </div>

            <div style={styles.footer}>
              <Link href="/auth/forgot-password" style={styles.button}>
                Request New Reset Link
              </Link>
              <p style={styles.footerText}>
                or{' '}
                <Link href="/auth/signin" style={styles.link}>
                  back to sign in
                </Link>
              </p>
            </div>
          </div>
        </div>
      </>
    );
  }

  // Ready state - show password reset form
  return (
    <>
      <Head>
        <title>Reset Password - AI Email Triage</title>
      </Head>
      <div style={styles.container}>
        <div style={styles.card}>
          <div style={styles.header}>
            <h1 style={styles.title}>Reset Password</h1>
            <p style={styles.subtitle}>Enter your new password below</p>
          </div>

          <form onSubmit={handleSubmit} style={styles.form}>
            <div style={styles.field}>
              <label htmlFor="password" style={styles.label}>
                New Password
              </label>
              <input
                id="password"
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                style={styles.input}
                placeholder="Enter new password"
                required
                autoComplete="new-password"
                minLength={6}
                autoFocus
              />
            </div>

            <div style={styles.field}>
              <label htmlFor="confirmPassword" style={styles.label}>
                Confirm New Password
              </label>
              <input
                id="confirmPassword"
                type="password"
                value={confirmPassword}
                onChange={(e) => setConfirmPassword(e.target.value)}
                style={styles.input}
                placeholder="Confirm new password"
                required
                autoComplete="new-password"
                minLength={6}
              />
            </div>

            {error && <div style={styles.error}>{error}</div>}

            <button
              type="submit"
              style={styles.submitButton}
              disabled={loading}
            >
              {loading ? 'Updating Password...' : 'Reset Password'}
            </button>
          </form>
        </div>
      </div>
    </>
  );
}

const styles: Record<string, React.CSSProperties> = {
  container: {
    minHeight: '100vh',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#f9fafb',
    padding: '24px',
  },
  card: {
    backgroundColor: 'white',
    borderRadius: '12px',
    padding: '40px',
    maxWidth: '400px',
    width: '100%',
    boxShadow: '0 4px 6px rgba(0, 0, 0, 0.1)',
  },
  header: {
    textAlign: 'center' as const,
    marginBottom: '32px',
  },
  iconSuccess: {
    width: '48px',
    height: '48px',
    borderRadius: '50%',
    backgroundColor: '#dcfce7',
    color: '#16a34a',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    fontSize: '24px',
    fontWeight: 'bold',
    margin: '0 auto 16px auto',
  },
  iconError: {
    width: '48px',
    height: '48px',
    borderRadius: '50%',
    backgroundColor: '#fef2f2',
    color: '#dc2626',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    fontSize: '24px',
    fontWeight: 'bold',
    margin: '0 auto 16px auto',
  },
  title: {
    fontSize: '28px',
    fontWeight: 700,
    margin: '0 0 8px 0',
    color: '#111827',
  },
  subtitle: {
    fontSize: '16px',
    color: '#6b7280',
    margin: 0,
  },
  form: {
    display: 'flex',
    flexDirection: 'column' as const,
    gap: '20px',
  },
  field: {
    display: 'flex',
    flexDirection: 'column' as const,
    gap: '6px',
  },
  label: {
    fontSize: '14px',
    fontWeight: 500,
    color: '#374151',
  },
  input: {
    padding: '12px 16px',
    fontSize: '15px',
    border: '1px solid #d1d5db',
    borderRadius: '8px',
    outline: 'none',
    transition: 'border-color 0.2s',
  },
  error: {
    padding: '12px 16px',
    backgroundColor: '#fef2f2',
    color: '#dc2626',
    borderRadius: '8px',
    fontSize: '14px',
  },
  submitButton: {
    padding: '14px 24px',
    fontSize: '16px',
    fontWeight: 500,
    backgroundColor: '#3b82f6',
    color: 'white',
    border: 'none',
    borderRadius: '8px',
    cursor: 'pointer',
    marginTop: '8px',
  },
  button: {
    display: 'block',
    padding: '14px 24px',
    fontSize: '16px',
    fontWeight: 500,
    backgroundColor: '#3b82f6',
    color: 'white',
    border: 'none',
    borderRadius: '8px',
    cursor: 'pointer',
    textAlign: 'center' as const,
    textDecoration: 'none',
    marginBottom: '16px',
  },
  loading: {
    textAlign: 'center' as const,
    color: '#6b7280',
    padding: '40px 0',
  },
  spinner: {
    width: '32px',
    height: '32px',
    border: '3px solid #e5e7eb',
    borderTopColor: '#3b82f6',
    borderRadius: '50%',
    margin: '0 auto 16px auto',
    animation: 'spin 1s linear infinite',
  },
  footer: {
    textAlign: 'center' as const,
  },
  footerText: {
    fontSize: '14px',
    color: '#6b7280',
    margin: 0,
  },
  link: {
    color: '#3b82f6',
    textDecoration: 'none',
    fontWeight: 500,
  },
};
