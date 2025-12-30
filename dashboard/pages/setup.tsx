import { useState, useEffect } from 'react';
import { useRouter } from 'next/router';
import Head from 'next/head';
import { getSettings, updateSettings, completeSetup, triggerIngest } from '@/lib/api';

type Step = 1 | 2 | 3 | 4 | 5 | 6;

interface GmailCredentials {
  email_address: string;
  email_password: string;
}

interface MicrosoftCredentials {
  microsoft_client_id: string;
  microsoft_client_secret: string;
}

interface SetupData {
  ingest_since_days: number;
  email_types_filter: string[];
  auto_approve_threshold: number;
  reply_tone: 'formal' | 'friendly' | 'neutral';
  signature: string;
}

const STEPS = [
  { title: 'Connect Email', description: 'Connect your email account to get started' },
  { title: 'Email History', description: 'How far back should we look in your inbox?' },
  { title: 'Email Types', description: 'What types of emails should we process?' },
  { title: 'Auto-Approve', description: 'Should we auto-send replies when AI confidence is very high?' },
  { title: 'Reply Tone', description: 'What tone should replies use?' },
  { title: 'Signature', description: 'What signature should we add to replies?' },
];

const EMAIL_TYPE_OPTIONS = [
  { value: 'all', label: 'All emails' },
  { value: 'inquiry', label: 'Customer inquiries' },
  { value: 'support', label: 'Support requests' },
  { value: 'complaint', label: 'Complaints' },
  { value: 'billing', label: 'Billing questions' },
];

export default function SetupPage() {
  const router = useRouter();
  const [step, setStep] = useState<Step>(1);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Email provider selection
  const [emailProvider, setEmailProvider] = useState<'gmail' | 'outlook'>('gmail');

  // Gmail credentials state (for app password flow)
  const [gmailCredentials, setGmailCredentials] = useState<GmailCredentials>({
    email_address: '',
    email_password: '',
  });

  // Microsoft credentials state (for OAuth flow)
  const [microsoftCredentials, setMicrosoftCredentials] = useState<MicrosoftCredentials>({
    microsoft_client_id: '',
    microsoft_client_secret: '',
  });

  // Connection state
  const [connectionTested, setConnectionTested] = useState(false);
  const [testingConnection, setTestingConnection] = useState(false);
  const [connectionError, setConnectionError] = useState<string | null>(null);
  const [connectedEmail, setConnectedEmail] = useState<string | null>(null);
  const [connectingMicrosoft, setConnectingMicrosoft] = useState(false);

  // Settings data state
  const [data, setData] = useState<SetupData>({
    ingest_since_days: 7,
    email_types_filter: ['all'],
    auto_approve_threshold: 0,
    reply_tone: 'neutral',
    signature: '',
  });

  // Handle OAuth callback from Microsoft
  useEffect(() => {
    const { oauth, email, error: oauthError } = router.query;

    if (oauth === 'success' && email) {
      setEmailProvider('outlook');
      setConnectionTested(true);
      setConnectedEmail(String(email));
      setConnectionError(null);
      // Clear query params
      router.replace('/setup', undefined, { shallow: true });
    } else if (oauth === 'failed' && oauthError) {
      setEmailProvider('outlook');
      setConnectionError(String(oauthError));
      setConnectionTested(false);
      // Clear query params
      router.replace('/setup', undefined, { shallow: true });
    }
  }, [router.query]);

  // Check if setup already completed (only on initial mount)
  useEffect(() => {
    let isMounted = true;

    const initSetup = async () => {
      try {
        const { settings } = await getSettings();
        if (!isMounted) return;
        if (settings?.setup_completed) {
          router.replace('/');
        } else {
          // Pre-fill email if already connected
          if (settings?.email_address) {
            setConnectedEmail(settings.email_address);
            if (settings.email_provider === 'outlook') {
              setEmailProvider('outlook');
              setConnectionTested(settings.email_credentials_verified);
            } else if (settings.email_provider === 'gmail') {
              setEmailProvider('gmail');
              setGmailCredentials(prev => ({ ...prev, email_address: settings.email_address || '' }));
              setConnectionTested(settings.email_credentials_verified);
            }
          }
          setLoading(false);
        }
      } catch (err) {
        if (!isMounted) return;
        // Client may not exist yet - try to create it
        console.log('getSettings failed, attempting to create client...');
        try {
          const initRes = await fetch('/api/auth/init-client', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
          });
          if (initRes.ok) {
            // Client created, try getSettings again
            try {
              const { settings } = await getSettings();
              if (!isMounted) return;
              if (settings?.setup_completed) {
                router.replace('/');
              } else {
                setLoading(false);
              }
            } catch {
              // Still failing, show error
              if (isMounted) {
                setError('Client lookup error: Please try signing out and back in');
                setLoading(false);
              }
            }
          } else {
            if (isMounted) {
              setError('Failed to initialize account. Please try signing out and back in.');
              setLoading(false);
            }
          }
        } catch {
          if (isMounted) {
            setLoading(false);
          }
        }
      }
    };

    initSetup();

    return () => {
      isMounted = false;
    };
  }, []);

  // Test Gmail connection (IMAP/SMTP)
  const testGmailConnection = async () => {
    setTestingConnection(true);
    setConnectionError(null);

    try {
      const res = await fetch('/api/email/test-connection', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          email_address: gmailCredentials.email_address,
          email_password: gmailCredentials.email_password,
          email_provider: 'gmail',
        }),
      });

      const result = await res.json();

      if (!res.ok) {
        const errorType = result.type === 'imap' ? 'receiving (IMAP)' : 'sending (SMTP)';
        setConnectionError(`${result.error || 'Connection failed'} (${errorType})`);
        setConnectionTested(false);
      } else {
        setConnectionTested(true);
        setConnectedEmail(gmailCredentials.email_address);
        setConnectionError(null);
      }
    } catch (err) {
      setConnectionError(err instanceof Error ? err.message : 'Connection test failed');
      setConnectionTested(false);
    } finally {
      setTestingConnection(false);
    }
  };

  // Connect Microsoft account (OAuth)
  const connectMicrosoftAccount = async () => {
    setConnectingMicrosoft(true);
    setConnectionError(null);

    try {
      const res = await fetch('/api/auth/microsoft/authorize', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          microsoft_client_id: microsoftCredentials.microsoft_client_id || undefined,
          microsoft_client_secret: microsoftCredentials.microsoft_client_secret || undefined,
        }),
      });

      const result = await res.json();

      if (!res.ok) {
        setConnectionError(result.message || 'Failed to start Microsoft authorization');
        setConnectingMicrosoft(false);
        return;
      }

      // Redirect to Microsoft OAuth
      window.location.href = result.auth_url;
    } catch (err) {
      setConnectionError(err instanceof Error ? err.message : 'Failed to connect');
      setConnectingMicrosoft(false);
    }
  };

  // Save Gmail credentials
  const saveGmailCredentials = async () => {
    const res = await fetch('/api/email/credentials', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        email_address: gmailCredentials.email_address,
        email_password: gmailCredentials.email_password,
        email_provider: 'gmail',
      }),
    });

    if (!res.ok) {
      const result = await res.json();
      throw new Error(result.message || 'Failed to save credentials');
    }
  };

  const handleNext = async () => {
    if (step < 6) {
      // For step 1, require connection test
      if (step === 1 && !connectionTested) {
        setError('Please connect your email account before continuing');
        return;
      }
      setStep((step + 1) as Step);
      setError(null);
    } else {
      // Final step - save all settings and complete
      setSaving(true);
      setError(null);
      try {
        // Only save Gmail credentials if using Gmail (Outlook creds saved during OAuth)
        if (emailProvider === 'gmail') {
          await saveGmailCredentials();
        }
        await updateSettings(data);
        await completeSetup();
        await triggerIngest();
        router.push('/');
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Setup failed');
        setSaving(false);
      }
    }
  };

  const handleBack = () => {
    if (step > 1) {
      setStep((step - 1) as Step);
      setError(null);
    }
  };

  const toggleEmailType = (value: string) => {
    if (value === 'all') {
      setData({ ...data, email_types_filter: ['all'] });
    } else {
      let newTypes = data.email_types_filter.filter((t) => t !== 'all');
      if (newTypes.includes(value)) {
        newTypes = newTypes.filter((t) => t !== value);
      } else {
        newTypes = [...newTypes, value];
      }
      if (newTypes.length === 0) {
        newTypes = ['all'];
      }
      setData({ ...data, email_types_filter: newTypes });
    }
  };

  const renderStep = () => {
    switch (step) {
      case 1:
        return (
          <div style={styles.stepContent}>
            {/* Email Provider Selection */}
            <div style={styles.field}>
              <label style={styles.label}>Email Provider</label>
              <div style={styles.providerButtons}>
                <button
                  type="button"
                  style={{
                    ...styles.providerButton,
                    ...(emailProvider === 'gmail' ? styles.providerButtonActive : {}),
                  }}
                  onClick={() => {
                    setEmailProvider('gmail');
                    setConnectionTested(false);
                    setConnectedEmail(null);
                    setConnectionError(null);
                  }}
                >
                  Gmail
                </button>
                <button
                  type="button"
                  style={{
                    ...styles.providerButton,
                    ...(emailProvider === 'outlook' ? styles.providerButtonActive : {}),
                  }}
                  onClick={() => {
                    setEmailProvider('outlook');
                    setConnectionTested(false);
                    setConnectedEmail(null);
                    setConnectionError(null);
                  }}
                >
                  Outlook / Microsoft 365
                </button>
              </div>
            </div>

            {/* Gmail Flow */}
            {emailProvider === 'gmail' && (
              <>
                <div style={styles.field}>
                  <label htmlFor="email" style={styles.label}>
                    Email Address
                  </label>
                  <input
                    id="email"
                    type="email"
                    value={gmailCredentials.email_address}
                    onChange={(e) => {
                      setGmailCredentials({ ...gmailCredentials, email_address: e.target.value });
                      setConnectionTested(false);
                    }}
                    style={styles.input}
                    placeholder="you@gmail.com"
                  />
                </div>

                <div style={styles.field}>
                  <label htmlFor="password" style={styles.label}>
                    App Password
                  </label>
                  <input
                    id="password"
                    type="password"
                    value={gmailCredentials.email_password}
                    onChange={(e) => {
                      setGmailCredentials({ ...gmailCredentials, email_password: e.target.value });
                      setConnectionTested(false);
                    }}
                    style={styles.input}
                    placeholder="Enter your app password"
                  />
                  <p style={styles.hint}>
                    You need an App Password, not your regular password.{' '}
                    <a
                      href="https://myaccount.google.com/apppasswords"
                      target="_blank"
                      rel="noopener noreferrer"
                      style={styles.link}
                    >
                      Create one here
                    </a>
                    {' '}(requires 2-Step Verification)
                  </p>
                </div>

                <button
                  type="button"
                  style={styles.testButton}
                  onClick={testGmailConnection}
                  disabled={testingConnection || !gmailCredentials.email_address || !gmailCredentials.email_password}
                >
                  {testingConnection ? 'Testing...' : 'Test Connection'}
                </button>
              </>
            )}

            {/* Outlook/Microsoft Flow */}
            {emailProvider === 'outlook' && (
              <>
                <div style={styles.oauthInfo}>
                  <p style={{ margin: 0, fontWeight: 500 }}>
                    Microsoft requires OAuth2 authentication
                  </p>
                  <p style={{ margin: '8px 0 0 0', fontSize: '13px', color: '#6b7280' }}>
                    Click the button below to securely connect your Microsoft account.
                    You&apos;ll be redirected to Microsoft to authorize access.
                  </p>
                </div>

                {/* Optional: Custom App Registration */}
                <details style={styles.advancedSection}>
                  <summary style={styles.advancedSummary}>
                    Advanced: Use your own Azure App Registration
                  </summary>
                  <div style={styles.advancedContent}>
                    <p style={styles.advancedHint}>
                      If you have your own Azure App Registration, enter the credentials below.
                      Otherwise, leave blank to use the default app.
                    </p>
                    <div style={styles.field}>
                      <label htmlFor="clientId" style={styles.label}>
                        Client ID (Application ID)
                      </label>
                      <input
                        id="clientId"
                        type="text"
                        value={microsoftCredentials.microsoft_client_id}
                        onChange={(e) =>
                          setMicrosoftCredentials({ ...microsoftCredentials, microsoft_client_id: e.target.value })
                        }
                        style={styles.input}
                        placeholder="xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx"
                      />
                    </div>
                    <div style={styles.field}>
                      <label htmlFor="clientSecret" style={styles.label}>
                        Client Secret
                      </label>
                      <input
                        id="clientSecret"
                        type="password"
                        value={microsoftCredentials.microsoft_client_secret}
                        onChange={(e) =>
                          setMicrosoftCredentials({ ...microsoftCredentials, microsoft_client_secret: e.target.value })
                        }
                        style={styles.input}
                        placeholder="Enter client secret"
                      />
                    </div>
                  </div>
                </details>

                <button
                  type="button"
                  style={styles.microsoftButton}
                  onClick={connectMicrosoftAccount}
                  disabled={connectingMicrosoft}
                >
                  {connectingMicrosoft ? 'Connecting...' : 'Connect with Microsoft'}
                </button>
              </>
            )}

            {/* Connection Status */}
            {connectionError && (
              <div style={styles.connectionError}>{connectionError}</div>
            )}
            {connectionTested && connectedEmail && (
              <div style={styles.connectionSuccess}>
                Connected to {connectedEmail}
              </div>
            )}
          </div>
        );

      case 2:
        return (
          <div style={styles.stepContent}>
            <div style={styles.radioGroup}>
              {[
                { value: 1, label: 'Last 24 hours' },
                { value: 7, label: 'Last 7 days' },
                { value: 30, label: 'Last 30 days' },
                { value: 90, label: 'Last 90 days' },
                { value: 0, label: 'All emails' },
              ].map((option) => (
                <label key={option.value} style={styles.radioLabel}>
                  <input
                    type="radio"
                    name="ingest_since_days"
                    value={option.value}
                    checked={data.ingest_since_days === option.value}
                    onChange={() => setData({ ...data, ingest_since_days: option.value })}
                    style={styles.radio}
                  />
                  {option.label}
                </label>
              ))}
            </div>
          </div>
        );

      case 3:
        return (
          <div style={styles.stepContent}>
            <div style={styles.checkboxGroup}>
              {EMAIL_TYPE_OPTIONS.map((option) => (
                <label key={option.value} style={styles.checkboxLabel}>
                  <input
                    type="checkbox"
                    checked={data.email_types_filter.includes(option.value)}
                    onChange={() => toggleEmailType(option.value)}
                    style={styles.checkbox}
                  />
                  {option.label}
                </label>
              ))}
            </div>
          </div>
        );

      case 4:
        return (
          <div style={styles.stepContent}>
            <div style={styles.radioGroup}>
              {[
                { value: 0, label: 'Never auto-send (always require approval)' },
                { value: 0.95, label: 'Auto-send when >95% confident' },
                { value: 0.9, label: 'Auto-send when >90% confident' },
              ].map((option) => (
                <label key={option.value} style={styles.radioLabel}>
                  <input
                    type="radio"
                    name="auto_approve_threshold"
                    value={option.value}
                    checked={data.auto_approve_threshold === option.value}
                    onChange={() => setData({ ...data, auto_approve_threshold: option.value })}
                    style={styles.radio}
                  />
                  {option.label}
                </label>
              ))}
            </div>
          </div>
        );

      case 5:
        return (
          <div style={styles.stepContent}>
            <div style={styles.radioGroup}>
              {[
                { value: 'formal' as const, label: 'Formal', desc: 'Professional and polished' },
                { value: 'friendly' as const, label: 'Friendly', desc: 'Warm and approachable' },
                { value: 'neutral' as const, label: 'Neutral', desc: 'Balanced and straightforward' },
              ].map((option) => (
                <label key={option.value} style={styles.radioLabelWithDesc}>
                  <input
                    type="radio"
                    name="reply_tone"
                    value={option.value}
                    checked={data.reply_tone === option.value}
                    onChange={() => setData({ ...data, reply_tone: option.value })}
                    style={styles.radio}
                  />
                  <div>
                    <div style={styles.optionLabel}>{option.label}</div>
                    <div style={styles.optionDesc}>{option.desc}</div>
                  </div>
                </label>
              ))}
            </div>
          </div>
        );

      case 6:
        return (
          <div style={styles.stepContent}>
            <textarea
              style={styles.textarea}
              value={data.signature}
              onChange={(e) => setData({ ...data, signature: e.target.value })}
              placeholder="Best regards,&#10;The Support Team&#10;support@example.com"
              rows={5}
            />
            <p style={styles.hint}>This will be appended to all email replies.</p>
          </div>
        );

      default:
        return null;
    }
  };

  if (loading) {
    return (
      <div style={styles.loadingContainer}>
        <p>Loading...</p>
      </div>
    );
  }

  return (
    <>
      <Head>
        <title>Setup - AI Email Triage</title>
      </Head>
      <div style={styles.container}>
        <div style={styles.card}>
          {/* Progress indicator */}
          <div style={styles.progress}>
            {STEPS.map((_, i) => (
              <div
                key={i}
                style={{
                  ...styles.progressDot,
                  backgroundColor: i + 1 <= step ? '#3b82f6' : '#e5e7eb',
                }}
              />
            ))}
          </div>

          {/* Step counter */}
          <p style={styles.stepCounter}>Step {step} of 6</p>

          {/* Title and description */}
          <h1 style={styles.title}>{STEPS[step - 1].title}</h1>
          <p style={styles.description}>{STEPS[step - 1].description}</p>

          {/* Step content */}
          {renderStep()}

          {/* Error message */}
          {error && <div style={styles.error}>{error}</div>}

          {/* Navigation buttons */}
          <div style={styles.actions}>
            {step > 1 && (
              <button
                type="button"
                style={styles.backButton}
                onClick={handleBack}
                disabled={saving}
              >
                Back
              </button>
            )}
            <button
              type="button"
              style={{
                ...styles.nextButton,
                ...(step === 1 && !connectionTested ? styles.nextButtonDisabled : {}),
              }}
              onClick={handleNext}
              disabled={saving || (step === 1 && !connectionTested)}
            >
              {saving ? 'Saving...' : step === 6 ? 'Complete Setup' : 'Next'}
            </button>
          </div>
        </div>
      </div>
    </>
  );
}

const styles: Record<string, React.CSSProperties> = {
  loadingContainer: {
    minHeight: '100vh',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#f9fafb',
  },
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
    maxWidth: '500px',
    width: '100%',
    boxShadow: '0 4px 6px rgba(0, 0, 0, 0.1)',
  },
  progress: {
    display: 'flex',
    justifyContent: 'center',
    gap: '8px',
    marginBottom: '24px',
  },
  progressDot: {
    width: '10px',
    height: '10px',
    borderRadius: '50%',
    transition: 'background-color 0.2s',
  },
  stepCounter: {
    textAlign: 'center' as const,
    fontSize: '14px',
    color: '#6b7280',
    marginBottom: '8px',
  },
  title: {
    fontSize: '24px',
    fontWeight: 700,
    textAlign: 'center' as const,
    margin: '0 0 8px 0',
    color: '#111827',
  },
  description: {
    fontSize: '16px',
    textAlign: 'center' as const,
    color: '#6b7280',
    margin: '0 0 32px 0',
  },
  stepContent: {
    marginBottom: '32px',
  },
  field: {
    marginBottom: '20px',
  },
  label: {
    display: 'block',
    fontSize: '14px',
    fontWeight: 500,
    color: '#374151',
    marginBottom: '8px',
  },
  input: {
    width: '100%',
    padding: '12px 16px',
    fontSize: '15px',
    border: '1px solid #d1d5db',
    borderRadius: '8px',
    outline: 'none',
    boxSizing: 'border-box' as const,
  },
  providerButtons: {
    display: 'flex',
    gap: '12px',
  },
  providerButton: {
    flex: 1,
    padding: '12px 16px',
    fontSize: '15px',
    backgroundColor: 'white',
    color: '#374151',
    border: '1px solid #d1d5db',
    borderRadius: '8px',
    cursor: 'pointer',
    fontWeight: 500,
    transition: 'all 0.2s',
  },
  providerButtonActive: {
    backgroundColor: '#3b82f6',
    color: 'white',
    borderColor: '#3b82f6',
  },
  hint: {
    fontSize: '13px',
    color: '#6b7280',
    marginTop: '8px',
  },
  link: {
    color: '#3b82f6',
    textDecoration: 'underline',
  },
  testButton: {
    width: '100%',
    padding: '12px 24px',
    fontSize: '15px',
    backgroundColor: '#10b981',
    color: 'white',
    border: 'none',
    borderRadius: '8px',
    cursor: 'pointer',
    fontWeight: 500,
  },
  microsoftButton: {
    width: '100%',
    padding: '14px 24px',
    fontSize: '15px',
    backgroundColor: '#0078d4',
    color: 'white',
    border: 'none',
    borderRadius: '8px',
    cursor: 'pointer',
    fontWeight: 500,
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    gap: '8px',
  },
  oauthInfo: {
    padding: '16px',
    backgroundColor: '#eff6ff',
    border: '1px solid #3b82f6',
    borderRadius: '8px',
    marginBottom: '20px',
  },
  advancedSection: {
    marginBottom: '20px',
  },
  advancedSummary: {
    cursor: 'pointer',
    fontSize: '14px',
    color: '#6b7280',
    padding: '8px 0',
  },
  advancedContent: {
    padding: '16px',
    backgroundColor: '#f9fafb',
    borderRadius: '8px',
    marginTop: '8px',
  },
  advancedHint: {
    fontSize: '13px',
    color: '#6b7280',
    marginBottom: '16px',
  },
  connectionError: {
    padding: '12px 16px',
    backgroundColor: '#fef2f2',
    color: '#dc2626',
    borderRadius: '8px',
    fontSize: '14px',
    marginTop: '16px',
  },
  connectionSuccess: {
    padding: '12px 16px',
    backgroundColor: '#f0fdf4',
    color: '#16a34a',
    borderRadius: '8px',
    fontSize: '14px',
    marginTop: '16px',
  },
  radioGroup: {
    display: 'flex',
    flexDirection: 'column' as const,
    gap: '12px',
  },
  radioLabel: {
    display: 'flex',
    alignItems: 'center',
    gap: '12px',
    padding: '12px 16px',
    border: '1px solid #e5e7eb',
    borderRadius: '8px',
    cursor: 'pointer',
    fontSize: '15px',
    transition: 'border-color 0.2s, background-color 0.2s',
  },
  radioLabelWithDesc: {
    display: 'flex',
    alignItems: 'flex-start',
    gap: '12px',
    padding: '12px 16px',
    border: '1px solid #e5e7eb',
    borderRadius: '8px',
    cursor: 'pointer',
    fontSize: '15px',
    transition: 'border-color 0.2s, background-color 0.2s',
  },
  radio: {
    width: '18px',
    height: '18px',
    accentColor: '#3b82f6',
  },
  optionLabel: {
    fontWeight: 500,
    color: '#111827',
  },
  optionDesc: {
    fontSize: '13px',
    color: '#6b7280',
    marginTop: '2px',
  },
  checkboxGroup: {
    display: 'flex',
    flexDirection: 'column' as const,
    gap: '12px',
  },
  checkboxLabel: {
    display: 'flex',
    alignItems: 'center',
    gap: '12px',
    padding: '12px 16px',
    border: '1px solid #e5e7eb',
    borderRadius: '8px',
    cursor: 'pointer',
    fontSize: '15px',
    transition: 'border-color 0.2s, background-color 0.2s',
  },
  checkbox: {
    width: '18px',
    height: '18px',
    accentColor: '#3b82f6',
  },
  textarea: {
    width: '100%',
    padding: '12px 16px',
    fontSize: '15px',
    border: '1px solid #d1d5db',
    borderRadius: '8px',
    resize: 'vertical' as const,
    fontFamily: 'inherit',
    lineHeight: '1.5',
    boxSizing: 'border-box' as const,
  },
  error: {
    padding: '12px 16px',
    backgroundColor: '#fef2f2',
    color: '#dc2626',
    borderRadius: '6px',
    marginBottom: '16px',
    fontSize: '14px',
  },
  actions: {
    display: 'flex',
    justifyContent: 'space-between',
    gap: '12px',
  },
  backButton: {
    padding: '12px 24px',
    fontSize: '15px',
    backgroundColor: 'white',
    color: '#374151',
    border: '1px solid #d1d5db',
    borderRadius: '8px',
    cursor: 'pointer',
    fontWeight: 500,
  },
  nextButton: {
    flex: 1,
    padding: '12px 24px',
    fontSize: '15px',
    backgroundColor: '#3b82f6',
    color: 'white',
    border: 'none',
    borderRadius: '8px',
    cursor: 'pointer',
    fontWeight: 500,
  },
  nextButtonDisabled: {
    backgroundColor: '#9ca3af',
    cursor: 'not-allowed',
  },
};
