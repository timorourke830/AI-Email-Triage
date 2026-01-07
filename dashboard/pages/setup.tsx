import { useState, useEffect } from 'react';
import { useRouter } from 'next/router';
import Head from 'next/head';
import {
  Mail,
  Check,
  ChevronRight,
  ChevronLeft,
  LogOut,
  AlertCircle,
  Loader2,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { getSettings, updateSettings, completeSetup, triggerIngest } from '@/lib/api';
import { getSupabaseBrowserClient } from '@/lib/supabase';
import { Button } from '@/components/ui/Button';
import { Input, Textarea } from '@/components/ui/Input';
import { Card } from '@/components/ui/Card';

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

// Step indicator component
function StepIndicator({ currentStep, totalSteps }: { currentStep: number; totalSteps: number }) {
  return (
    <div className="flex items-center justify-center gap-2 mb-6">
      {Array.from({ length: totalSteps }, (_, i) => (
        <div
          key={i}
          className={cn(
            'w-2.5 h-2.5 rounded-full transition-all duration-300',
            i + 1 <= currentStep
              ? 'bg-primary-600'
              : 'bg-slate-200 dark:bg-slate-700'
          )}
        />
      ))}
    </div>
  );
}

// Radio option component
function RadioOption({
  selected,
  onClick,
  children,
  description,
}: {
  selected: boolean;
  onClick: () => void;
  children: React.ReactNode;
  description?: string;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        'w-full p-4 rounded-lg border-2 text-left transition-all duration-200',
        selected
          ? 'border-primary-500 bg-primary-50 dark:bg-primary-900/20'
          : 'border-slate-200 dark:border-slate-700 hover:border-slate-300 dark:hover:border-slate-600'
      )}
    >
      <div className="flex items-start gap-3">
        <div className={cn(
          'mt-0.5 w-5 h-5 rounded-full border-2 flex items-center justify-center shrink-0',
          selected
            ? 'border-primary-600 bg-primary-600'
            : 'border-slate-300 dark:border-slate-600'
        )}>
          {selected && <Check className="w-3 h-3 text-white" />}
        </div>
        <div>
          <p className={cn(
            'font-medium',
            selected ? 'text-primary-700 dark:text-primary-300' : 'text-slate-700 dark:text-slate-300'
          )}>
            {children}
          </p>
          {description && (
            <p className="text-sm text-slate-500 dark:text-slate-400 mt-0.5">
              {description}
            </p>
          )}
        </div>
      </div>
    </button>
  );
}

// Checkbox option component
function CheckboxOption({
  checked,
  onChange,
  children,
}: {
  checked: boolean;
  onChange: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onChange}
      className={cn(
        'w-full p-4 rounded-lg border-2 text-left transition-all duration-200',
        checked
          ? 'border-primary-500 bg-primary-50 dark:bg-primary-900/20'
          : 'border-slate-200 dark:border-slate-700 hover:border-slate-300 dark:hover:border-slate-600'
      )}
    >
      <div className="flex items-center gap-3">
        <div className={cn(
          'w-5 h-5 rounded border-2 flex items-center justify-center shrink-0',
          checked
            ? 'border-primary-600 bg-primary-600'
            : 'border-slate-300 dark:border-slate-600'
        )}>
          {checked && <Check className="w-3 h-3 text-white" />}
        </div>
        <span className={cn(
          'font-medium',
          checked ? 'text-primary-700 dark:text-primary-300' : 'text-slate-700 dark:text-slate-300'
        )}>
          {children}
        </span>
      </div>
    </button>
  );
}

export default function SetupPage() {
  const router = useRouter();
  const [step, setStep] = useState<Step>(1);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Email provider selection
  const [emailProvider, setEmailProvider] = useState<'gmail' | 'outlook'>('gmail');

  // Gmail credentials state
  const [gmailCredentials, setGmailCredentials] = useState<GmailCredentials>({
    email_address: '',
    email_password: '',
  });

  // Microsoft credentials state
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

  // Sign out handler
  const handleSignOut = async () => {
    const supabase = getSupabaseBrowserClient();
    await supabase.auth.signOut();
    router.push('/auth/signin');
  };

  // Handle OAuth callback from Microsoft
  useEffect(() => {
    const { oauth, email, error: oauthError } = router.query;

    if (oauth === 'success' && email) {
      setEmailProvider('outlook');
      setConnectionTested(true);
      setConnectedEmail(String(email));
      setConnectionError(null);
      router.replace('/setup', undefined, { shallow: true });
    } else if (oauth === 'failed' && oauthError) {
      const checkExistingConnection = async () => {
        try {
          const { settings } = await getSettings();
          if (settings?.email_credentials_verified && settings?.email_address) {
            setEmailProvider('outlook');
            setConnectionTested(true);
            setConnectedEmail(settings.email_address);
            setConnectionError(null);
          } else {
            setEmailProvider('outlook');
            setConnectionError(String(oauthError));
            setConnectionTested(false);
          }
        } catch {
          setEmailProvider('outlook');
          setConnectionError(String(oauthError));
          setConnectionTested(false);
        }
        router.replace('/setup', undefined, { shallow: true });
      };
      checkExistingConnection();
    }
  }, [router.query]);

  // Check if setup already completed
  useEffect(() => {
    let isMounted = true;

    const initSetup = async () => {
      try {
        const { settings } = await getSettings();
        if (!isMounted) return;
        if (settings?.setup_completed) {
          router.replace('/');
        } else {
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
      } catch {
        if (!isMounted) return;
        try {
          const initRes = await fetch('/api/auth/init-client', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
          });
          if (initRes.ok) {
            try {
              const { settings } = await getSettings();
              if (!isMounted) return;
              if (settings?.setup_completed) {
                router.replace('/');
              } else {
                setLoading(false);
              }
            } catch {
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

  // Test Gmail connection
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

  // Connect Microsoft account
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
      if (step === 1 && !connectionTested) {
        setError('Please connect your email account before continuing');
        return;
      }
      setStep((step + 1) as Step);
      setError(null);
    } else {
      setSaving(true);
      setError(null);
      try {
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
          <div className="space-y-6">
            {/* Email Provider Selection */}
            <div>
              <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-3">
                Email Provider
              </label>
              <div className="grid grid-cols-2 gap-3">
                <button
                  type="button"
                  onClick={() => {
                    setEmailProvider('gmail');
                    setConnectionTested(false);
                    setConnectedEmail(null);
                    setConnectionError(null);
                  }}
                  className={cn(
                    'flex items-center justify-center gap-2 p-4 rounded-lg border-2 font-medium transition-all',
                    emailProvider === 'gmail'
                      ? 'border-primary-500 bg-primary-50 text-primary-700 dark:bg-primary-900/20 dark:text-primary-300'
                      : 'border-slate-200 dark:border-slate-700 text-slate-600 dark:text-slate-400 hover:border-slate-300'
                  )}
                >
                  <svg className="w-5 h-5" viewBox="0 0 24 24">
                    <path fill="currentColor" d="M20.37 5.03L12 11l-8.37-5.97A1.5 1.5 0 0 1 5 3h14a1.5 1.5 0 0 1 1.37 2.03zM12 13L3 6.5V18a1.5 1.5 0 0 0 1.5 1.5h15A1.5 1.5 0 0 0 21 18V6.5L12 13z" />
                  </svg>
                  Gmail
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setEmailProvider('outlook');
                    setConnectionTested(false);
                    setConnectedEmail(null);
                    setConnectionError(null);
                  }}
                  className={cn(
                    'flex items-center justify-center gap-2 p-4 rounded-lg border-2 font-medium transition-all',
                    emailProvider === 'outlook'
                      ? 'border-primary-500 bg-primary-50 text-primary-700 dark:bg-primary-900/20 dark:text-primary-300'
                      : 'border-slate-200 dark:border-slate-700 text-slate-600 dark:text-slate-400 hover:border-slate-300'
                  )}
                >
                  <svg className="w-5 h-5" viewBox="0 0 24 24">
                    <path fill="currentColor" d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm-1 17.93c-3.95-.49-7-3.85-7-7.93 0-.62.08-1.21.21-1.79L9 15v1c0 1.1.9 2 2 2v1.93zm6.9-2.54c-.26-.81-1-1.39-1.9-1.39h-1v-3c0-.55-.45-1-1-1H8v-2h2c.55 0 1-.45 1-1V7h2c1.1 0 2-.9 2-2v-.41c2.93 1.19 5 4.06 5 7.41 0 2.08-.8 3.97-2.1 5.39z" />
                  </svg>
                  Outlook / 365
                </button>
              </div>
            </div>

            {/* Gmail Flow */}
            {emailProvider === 'gmail' && (
              <>
                <Input
                  label="Email Address"
                  type="email"
                  value={gmailCredentials.email_address}
                  onChange={(e) => {
                    setGmailCredentials({ ...gmailCredentials, email_address: e.target.value });
                    setConnectionTested(false);
                  }}
                  placeholder="you@gmail.com"
                />

                <Input
                  label="App Password"
                  type="password"
                  value={gmailCredentials.email_password}
                  onChange={(e) => {
                    setGmailCredentials({ ...gmailCredentials, email_password: e.target.value });
                    setConnectionTested(false);
                  }}
                  placeholder="Enter your app password"
                  hint={
                    <>
                      You need an App Password, not your regular password.{' '}
                      <a
                        href="https://myaccount.google.com/apppasswords"
                        target="_blank"
                        rel="noopener noreferrer"
                        className="text-primary-600 hover:underline"
                      >
                        Create one here
                      </a>{' '}
                      (requires 2-Step Verification)
                    </>
                  }
                />

                <Button
                  onClick={testGmailConnection}
                  isLoading={testingConnection}
                  disabled={!gmailCredentials.email_address || !gmailCredentials.email_password}
                  variant="success"
                  className="w-full"
                >
                  Test Connection
                </Button>
              </>
            )}

            {/* Outlook Flow */}
            {emailProvider === 'outlook' && (
              <>
                <div className="p-4 rounded-lg bg-blue-50 dark:bg-blue-900/20 border border-blue-200 dark:border-blue-800">
                  <p className="text-sm font-medium text-blue-800 dark:text-blue-300">
                    Microsoft requires OAuth2 authentication
                  </p>
                  <p className="text-sm text-blue-700 dark:text-blue-400 mt-1">
                    Click the button below to securely connect your Microsoft account.
                  </p>
                </div>

                <details className="group">
                  <summary className="text-sm text-slate-500 dark:text-slate-400 cursor-pointer hover:text-slate-700 dark:hover:text-slate-300">
                    Advanced: Use your own Azure App Registration
                  </summary>
                  <div className="mt-4 p-4 rounded-lg bg-slate-50 dark:bg-slate-800/50 space-y-4">
                    <p className="text-xs text-slate-500 dark:text-slate-400">
                      If you have your own Azure App Registration, enter the credentials below.
                      Otherwise, leave blank to use the default app.
                    </p>
                    <Input
                      label="Client ID (Application ID)"
                      type="text"
                      value={microsoftCredentials.microsoft_client_id}
                      onChange={(e) =>
                        setMicrosoftCredentials({ ...microsoftCredentials, microsoft_client_id: e.target.value })
                      }
                      placeholder="xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx"
                    />
                    <Input
                      label="Client Secret"
                      type="password"
                      value={microsoftCredentials.microsoft_client_secret}
                      onChange={(e) =>
                        setMicrosoftCredentials({ ...microsoftCredentials, microsoft_client_secret: e.target.value })
                      }
                      placeholder="Enter client secret"
                    />
                  </div>
                </details>

                <Button
                  onClick={connectMicrosoftAccount}
                  isLoading={connectingMicrosoft}
                  className="w-full bg-[#0078d4] hover:bg-[#106ebe]"
                >
                  <svg className="w-5 h-5" viewBox="0 0 23 23">
                    <path fill="currentColor" d="M0 0h11v11H0V0zm12 0h11v11H12V0zM0 12h11v11H0V12zm12 0h11v11H12V12z" />
                  </svg>
                  Connect with Microsoft
                </Button>
              </>
            )}

            {/* Connection Status */}
            {connectionError && (
              <div className="flex items-start gap-2 p-3 rounded-lg bg-red-50 dark:bg-red-900/20 text-red-700 dark:text-red-400">
                <AlertCircle className="w-5 h-5 shrink-0 mt-0.5" />
                <span className="text-sm">{connectionError}</span>
              </div>
            )}
            {connectionTested && connectedEmail && (
              <div className="flex items-center gap-2 p-3 rounded-lg bg-emerald-50 dark:bg-emerald-900/20 text-emerald-700 dark:text-emerald-400">
                <Check className="w-5 h-5" />
                <span className="text-sm font-medium">Connected to {connectedEmail}</span>
              </div>
            )}
          </div>
        );

      case 2:
        return (
          <div className="space-y-3">
            {[
              { value: 1, label: 'Last 24 hours' },
              { value: 7, label: 'Last 7 days' },
              { value: 30, label: 'Last 30 days' },
              { value: 90, label: 'Last 90 days' },
              { value: 0, label: 'All emails' },
            ].map((option) => (
              <RadioOption
                key={option.value}
                selected={data.ingest_since_days === option.value}
                onClick={() => setData({ ...data, ingest_since_days: option.value })}
              >
                {option.label}
              </RadioOption>
            ))}
          </div>
        );

      case 3:
        return (
          <div className="space-y-3">
            {EMAIL_TYPE_OPTIONS.map((option) => (
              <CheckboxOption
                key={option.value}
                checked={data.email_types_filter.includes(option.value)}
                onChange={() => toggleEmailType(option.value)}
              >
                {option.label}
              </CheckboxOption>
            ))}
          </div>
        );

      case 4:
        return (
          <div className="space-y-3">
            {[
              { value: 0, label: 'Never auto-send', description: 'Always require approval' },
              { value: 0.95, label: 'Auto-send when >95% confident', description: 'Recommended for most users' },
              { value: 0.9, label: 'Auto-send when >90% confident', description: 'More aggressive automation' },
            ].map((option) => (
              <RadioOption
                key={option.value}
                selected={data.auto_approve_threshold === option.value}
                onClick={() => setData({ ...data, auto_approve_threshold: option.value })}
                description={option.description}
              >
                {option.label}
              </RadioOption>
            ))}
          </div>
        );

      case 5:
        return (
          <div className="space-y-3">
            {[
              { value: 'formal' as const, label: 'Formal', description: 'Professional and polished' },
              { value: 'friendly' as const, label: 'Friendly', description: 'Warm and approachable' },
              { value: 'neutral' as const, label: 'Neutral', description: 'Balanced and straightforward' },
            ].map((option) => (
              <RadioOption
                key={option.value}
                selected={data.reply_tone === option.value}
                onClick={() => setData({ ...data, reply_tone: option.value })}
                description={option.description}
              >
                {option.label}
              </RadioOption>
            ))}
          </div>
        );

      case 6:
        return (
          <div className="space-y-4">
            <Textarea
              value={data.signature}
              onChange={(e) => setData({ ...data, signature: e.target.value })}
              placeholder="Best regards,&#10;The Support Team&#10;support@example.com"
              className="min-h-[150px]"
            />
            <p className="text-sm text-slate-500 dark:text-slate-400">
              This will be appended to all email replies.
            </p>
          </div>
        );

      default:
        return null;
    }
  };

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-slate-50 dark:bg-slate-900">
        <div className="flex flex-col items-center gap-4">
          <Loader2 className="w-8 h-8 text-primary-600 animate-spin" />
          <p className="text-sm text-slate-500 dark:text-slate-400">Loading...</p>
        </div>
      </div>
    );
  }

  return (
    <>
      <Head>
        <title>Setup - AI Email Triage</title>
      </Head>

      <div className="min-h-screen flex items-center justify-center bg-slate-50 dark:bg-slate-900 p-6">
        <Card className="w-full max-w-lg p-8">
          {/* Logo */}
          <div className="flex justify-center mb-6">
            <div className="w-12 h-12 rounded-xl bg-primary-600 flex items-center justify-center">
              <Mail className="w-6 h-6 text-white" />
            </div>
          </div>

          {/* Step Indicator */}
          <StepIndicator currentStep={step} totalSteps={6} />

          {/* Step Counter */}
          <p className="text-center text-sm text-slate-500 dark:text-slate-400 mb-2">
            Step {step} of 6
          </p>

          {/* Title and Description */}
          <h1 className="text-xl font-semibold text-center text-slate-900 dark:text-white mb-1">
            {STEPS[step - 1].title}
          </h1>
          <p className="text-center text-slate-500 dark:text-slate-400 mb-8">
            {STEPS[step - 1].description}
          </p>

          {/* Step Content */}
          <div className="mb-8">
            {renderStep()}
          </div>

          {/* Error */}
          {error && (
            <div className="mb-4 flex items-start gap-2 p-3 rounded-lg bg-red-50 dark:bg-red-900/20 text-red-700 dark:text-red-400">
              <AlertCircle className="w-5 h-5 shrink-0 mt-0.5" />
              <span className="text-sm">{error}</span>
            </div>
          )}

          {/* Navigation */}
          <div className="flex gap-3">
            {step > 1 && (
              <Button
                variant="secondary"
                onClick={handleBack}
                disabled={saving}
              >
                <ChevronLeft className="w-4 h-4" />
                Back
              </Button>
            )}
            <Button
              onClick={handleNext}
              isLoading={saving}
              disabled={step === 1 && !connectionTested}
              className="flex-1"
            >
              {step === 6 ? 'Complete Setup' : 'Continue'}
              {step < 6 && <ChevronRight className="w-4 h-4" />}
            </Button>
          </div>

          {/* Sign Out */}
          <div className="mt-6 pt-6 border-t border-slate-200 dark:border-slate-700 text-center">
            <button
              type="button"
              onClick={handleSignOut}
              className="inline-flex items-center gap-2 text-sm text-slate-500 dark:text-slate-400 hover:text-slate-700 dark:hover:text-slate-300"
            >
              <LogOut className="w-4 h-4" />
              Sign out
            </button>
          </div>
        </Card>
      </div>
    </>
  );
}
