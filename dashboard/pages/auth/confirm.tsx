import { useEffect, useState } from 'react';
import { useRouter } from 'next/router';
import Head from 'next/head';
import Link from 'next/link';
import { getSupabaseBrowserClient } from '@/lib/supabase';

type ConfirmState = 'loading' | 'error';

export default function ConfirmPage() {
  const router = useRouter();
  const [state, setState] = useState<ConfirmState>('loading');
  const [errorMessage, setErrorMessage] = useState<string>('');

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
        const { error } = await supabase.auth.verifyOtp({
          token_hash,
          type: type as 'recovery' | 'signup' | 'email',
        });

        if (error) {
          setState('error');
          setErrorMessage(error.message || 'Failed to verify token');
          return;
        }

        // Token verified successfully - redirect based on type
        if (type === 'recovery') {
          // Password recovery - redirect to reset password page
          router.replace('/auth/reset-password');
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
