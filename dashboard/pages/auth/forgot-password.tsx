import { useState } from 'react';
import Head from 'next/head';
import Link from 'next/link';
import { getSupabaseBrowserClient } from '@/lib/supabase';

export default function ForgotPasswordPage() {
  const [email, setEmail] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [submitted, setSubmitted] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError(null);

    try {
      const supabase = getSupabaseBrowserClient();

      const { error: resetError } = await supabase.auth.resetPasswordForEmail(email, {
        redirectTo: 'https://ai-email-triage-dqh9.vercel.app/auth/reset-password',
      });

      if (resetError) {
        setError(resetError.message);
        setLoading(false);
        return;
      }

      setSubmitted(true);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'An error occurred');
    } finally {
      setLoading(false);
    }
  };

  if (submitted) {
    return (
      <>
        <Head>
          <title>Check Your Email - AI Email Triage</title>
        </Head>
        <div style={styles.container}>
          <div style={styles.card}>
            <div style={styles.header}>
              <div style={styles.iconSuccess}>&#10003;</div>
              <h1 style={styles.title}>Check Your Email</h1>
              <p style={styles.subtitle}>
                We&apos;ve sent a password reset link to <strong>{email}</strong>
              </p>
            </div>

            <div style={styles.instructions}>
              <p style={styles.instructionText}>
                Click the link in the email to reset your password.
                If you don&apos;t see the email, check your spam folder.
              </p>
            </div>

            <div style={styles.footer}>
              <Link href="/auth/signin" style={styles.link}>
                &larr; Back to Sign In
              </Link>
            </div>
          </div>
        </div>
      </>
    );
  }

  return (
    <>
      <Head>
        <title>Forgot Password - AI Email Triage</title>
      </Head>
      <div style={styles.container}>
        <div style={styles.card}>
          <div style={styles.header}>
            <h1 style={styles.title}>Forgot Password?</h1>
            <p style={styles.subtitle}>
              Enter your email and we&apos;ll send you a reset link
            </p>
          </div>

          <form onSubmit={handleSubmit} style={styles.form}>
            <div style={styles.field}>
              <label htmlFor="email" style={styles.label}>
                Email
              </label>
              <input
                id="email"
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                style={styles.input}
                placeholder="you@example.com"
                required
                autoComplete="email"
                autoFocus
              />
            </div>

            {error && <div style={styles.error}>{error}</div>}

            <button
              type="submit"
              style={styles.button}
              disabled={loading}
            >
              {loading ? 'Sending...' : 'Send Reset Link'}
            </button>
          </form>

          <div style={styles.footer}>
            <p style={styles.footerText}>
              Remember your password?{' '}
              <Link href="/auth/signin" style={styles.link}>
                Sign in
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
    lineHeight: 1.5,
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
  instructions: {
    padding: '16px',
    backgroundColor: '#f9fafb',
    borderRadius: '8px',
    marginBottom: '24px',
  },
  instructionText: {
    fontSize: '14px',
    color: '#6b7280',
    margin: 0,
    lineHeight: 1.6,
  },
  footer: {
    marginTop: '24px',
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
