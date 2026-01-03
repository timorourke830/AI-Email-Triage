import { useState, useEffect, useCallback } from 'react';
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
  const [debugInfo, setDebugInfo] = useState<string>('');

  const showReady = useCallback(() => {
    setPageState('ready');
  }, []);

  useEffect(() => {
    const supabase = getSupabaseBrowserClient();
    let mounted = true;
    let timeoutId: NodeJS.Timeout | null = null;

    // Debug: Log the current URL hash
    const hash = window.location.hash;
    console.log('[Reset Password] URL hash:', hash);
    console.log('[Reset Password] Full URL:', window.location.href);

    // Check if URL contains recovery tokens
    const hashParams = new URLSearchParams(hash.substring(1));
    const accessToken = hashParams.get('access_token');
    const tokenType = hashParams.get('type');
    const hasRecoveryHash = hash.includes('type=recovery') || tokenType === 'recovery';

    console.log('[Reset Password] Has recovery hash:', hasRecoveryHash);
    console.log('[Reset Password] Token type:', tokenType);
    console.log('[Reset Password] Access token exists:', !!accessToken);

    setDebugInfo(`Hash: ${hash ? 'present' : 'none'}, Type: ${tokenType || 'none'}, Token: ${accessToken ? 'yes' : 'no'}`);

    // Set up auth state change listener FIRST
    const { data: { subscription } } = supabase.auth.onAuthStateChange((event, session) => {
      console.log('[Reset Password] Auth event:', event, 'Session:', !!session);

      if (!mounted) return;

      if (event === 'PASSWORD_RECOVERY') {
        console.log('[Reset Password] PASSWORD_RECOVERY event received');
        showReady();
        if (timeoutId) clearTimeout(timeoutId);
      } else if (event === 'SIGNED_IN' && session) {
        // SIGNED_IN can also indicate successful token exchange
        console.log('[Reset Password] SIGNED_IN event received');
        showReady();
        if (timeoutId) clearTimeout(timeoutId);
      } else if (event === 'TOKEN_REFRESHED' && session) {
        console.log('[Reset Password] TOKEN_REFRESHED event received');
        showReady();
        if (timeoutId) clearTimeout(timeoutId);
      }
    });

    // Check for existing session (event may have already fired before we mounted)
    const checkSession = async () => {
      console.log('[Reset Password] Checking for existing session...');

      const { data: { session }, error: sessionError } = await supabase.auth.getSession();

      console.log('[Reset Password] Session check result:', {
        hasSession: !!session,
        error: sessionError?.message,
        userEmail: session?.user?.email
      });

      if (!mounted) return;

      if (session) {
        // Session exists - user can reset password
        console.log('[Reset Password] Session found, showing form');
        showReady();
        if (timeoutId) clearTimeout(timeoutId);
        return;
      }

      // If there's a recovery hash but no session yet, Supabase needs to process it
      // This happens when the hash is present but not yet exchanged for a session
      if (hasRecoveryHash && accessToken) {
        console.log('[Reset Password] Recovery hash found, waiting for Supabase to process...');

        // Give Supabase more time to process the hash
        // The onAuthStateChange listener should catch the event
        timeoutId = setTimeout(() => {
          if (!mounted) return;

          // Check session one more time before giving up
          supabase.auth.getSession().then(({ data: { session: finalSession } }) => {
            if (!mounted) return;

            if (finalSession) {
              console.log('[Reset Password] Session found on final check');
              showReady();
            } else {
              console.log('[Reset Password] No session after timeout, showing invalid');
              setPageState('invalid');
            }
          });
        }, 5000); // Give it 5 seconds for hash processing

        return;
      }

      // No hash and no session - definitely invalid
      console.log('[Reset Password] No recovery hash and no session');
      setPageState('invalid');
    };

    // Small delay to ensure auth listener is fully set up
    setTimeout(checkSession, 100);

    return () => {
      mounted = false;
      subscription.unsubscribe();
      if (timeoutId) clearTimeout(timeoutId);
    };
  }, [showReady]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError(null);

    if (password !== confirmPassword) {
      setError('Passwords do not match');
      setLoading(false);
      return;
    }

    if (password.length < 6) {
      setError('Password must be at least 6 characters');
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

      setPageState('success');
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
        <div style={styles.container}>
          <div style={styles.card}>
            <div style={styles.loading}>
              <div style={styles.spinner}></div>
              <p>Verifying reset link...</p>
              {process.env.NODE_ENV === 'development' && (
                <p style={{ fontSize: '12px', marginTop: '10px', color: '#999' }}>{debugInfo}</p>
              )}
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

  // Success state
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

  // Invalid state
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
              {process.env.NODE_ENV === 'development' && (
                <p style={{ fontSize: '12px', marginTop: '10px', color: '#999' }}>{debugInfo}</p>
              )}
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

  // Ready state - show form
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
