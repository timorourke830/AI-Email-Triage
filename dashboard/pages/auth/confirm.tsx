import { useEffect, useState } from 'react';
import { useRouter } from 'next/router';
import Head from 'next/head';
import Link from 'next/link';
import { getSupabaseBrowserClient } from '@/lib/supabase';

type ConfirmState = 'loading' | 'password_reset' | 'success' | 'error';

export default function ConfirmPage() {
  const router = useRouter();
  const [state, setState] = useState<ConfirmState>('loading');
  const [errorMessage, setErrorMessage] = useState<string>('');

  // Password reset form state
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [updating, setUpdating] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);

  useEffect(() => {
    const handleTokenExchange = async () => {
      const { token_hash, type } = router.query;

      // Wait for query params to be available
      if (!router.isReady) return;

      // Validate required params
      if (!token_hash || typeof token_hash !== 'string') {
        setState('error');
        setErrorMessage('Invalid confirmation link - missing token');
        return;
      }

      if (!type || typeof type !== 'string') {
        setState('error');
        setErrorMessage('Invalid confirmation link - missing type');
        return;
      }

      const supabase = getSupabaseBrowserClient();

      try {
        // Exchange the token for a session using PKCE flow
        const { data, error } = await supabase.auth.verifyOtp({
          token_hash,
          type: type as 'recovery' | 'signup' | 'email',
        });

        if (error) {
          setState('error');
          setErrorMessage(error.message || 'Failed to verify token');
          return;
        }

        // Handle based on type
        if (type === 'recovery') {
          // Password recovery - show password reset form directly
          // This avoids session persistence issues between page navigations
          setState('password_reset');
        } else if (type === 'signup' || type === 'email') {
          // Email confirmation - redirect to home or setup
          router.replace('/');
        } else {
          // Unknown type - redirect to home
          router.replace('/');
        }
      } catch (err) {
        setState('error');
        setErrorMessage(err instanceof Error ? err.message : 'An unexpected error occurred');
      }
    };

    handleTokenExchange();
  }, [router.isReady, router.query, router]);

  const handlePasswordSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setFormError(null);
    setUpdating(true);

    // Validate passwords
    if (password !== confirmPassword) {
      setFormError('Passwords do not match');
      setUpdating(false);
      return;
    }

    if (password.length < 8) {
      setFormError('Password must be at least 8 characters');
      setUpdating(false);
      return;
    }

    try {
      const supabase = getSupabaseBrowserClient();

      const { error: updateError } = await supabase.auth.updateUser({
        password: password,
      });

      if (updateError) {
        setFormError(updateError.message);
        setUpdating(false);
        return;
      }

      // Password updated successfully - show success and sign out
      setState('success');

      // Sign out and redirect to signin
      await supabase.auth.signOut();

      setTimeout(() => {
        router.push('/auth/signin?message=password_reset');
      }, 2000);
    } catch (err) {
      setFormError(err instanceof Error ? err.message : 'An error occurred');
      setUpdating(false);
    }
  };

  // Loading state
  if (state === 'loading') {
    return (
      <>
        <Head>
          <title>Confirming... - AI Email Triage</title>
        </Head>
        <div style={styles.container}>
          <div style={styles.card}>
            <div style={styles.loading}>
              <div style={styles.spinner}></div>
              <p>Verifying your link...</p>
            </div>
          </div>
        </div>
        <style jsx global>{`
          @keyframes spin {
            to { transform: rotate(360deg); }
          }
        `}</style>
      </>
    );
  }

  // Success state (after password reset)
  if (state === 'success') {
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

  // Password reset form state
  if (state === 'password_reset') {
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

            <form onSubmit={handlePasswordSubmit} style={styles.form}>
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
                  placeholder="At least 8 characters"
                  required
                  autoComplete="new-password"
                  minLength={8}
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
                  minLength={8}
                />
              </div>

              {formError && <div style={styles.formError}>{formError}</div>}

              <button
                type="submit"
                style={styles.button}
                disabled={updating}
              >
                {updating ? 'Updating Password...' : 'Reset Password'}
              </button>
            </form>
          </div>
        </div>
      </>
    );
  }

  // Error state
  return (
    <>
      <Head>
        <title>Link Invalid - AI Email Triage</title>
      </Head>
      <div style={styles.container}>
        <div style={styles.card}>
          <div style={styles.header}>
            <div style={styles.iconError}>!</div>
            <h1 style={styles.title}>Link Invalid or Expired</h1>
            <p style={styles.subtitle}>
              {errorMessage || 'This link is no longer valid.'}
            </p>
          </div>

          <div style={styles.footer}>
            <Link href="/auth/forgot-password" style={styles.buttonLink}>
              Request New Link
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
  formError: {
    padding: '12px 16px',
    backgroundColor: '#fef2f2',
    color: '#dc2626',
    borderRadius: '8px',
    fontSize: '14px',
  },
  button: {
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
  footer: {
    textAlign: 'center' as const,
  },
  footerText: {
    fontSize: '14px',
    color: '#6b7280',
    margin: 0,
  },
  buttonLink: {
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
  link: {
    color: '#3b82f6',
    textDecoration: 'none',
    fontWeight: 500,
  },
};
