import { useState, useEffect } from 'react';
import { useRouter } from 'next/router';
import Head from 'next/head';
import Link from 'next/link';
import { getSettings, updateSettings, triggerIngest } from '@/lib/api';
import type { ClientSettings } from '@/lib/types';

const EMAIL_TYPE_OPTIONS = [
  { value: 'all', label: 'All emails' },
  { value: 'inquiry', label: 'Customer inquiries' },
  { value: 'support', label: 'Support requests' },
  { value: 'complaint', label: 'Complaints' },
  { value: 'billing', label: 'Billing questions' },
];

export default function SettingsPage() {
  const router = useRouter();
  const [settings, setSettings] = useState<ClientSettings | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [ingesting, setIngesting] = useState(false);
  const [message, setMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null);

  useEffect(() => {
    getSettings()
      .then(({ settings }) => {
        if (!settings?.setup_completed) {
          router.replace('/setup');
        } else {
          setSettings(settings);
          setLoading(false);
        }
      })
      .catch((err) => {
        setMessage({ type: 'error', text: err.message });
        setLoading(false);
      });
  }, [router]);

  const handleSave = async () => {
    if (!settings) return;
    setSaving(true);
    setMessage(null);
    try {
      const { settings: updated } = await updateSettings({
        ingest_since_days: settings.ingest_since_days,
        email_types_filter: settings.email_types_filter,
        auto_approve_threshold: settings.auto_approve_threshold,
        reply_tone: settings.reply_tone,
        signature: settings.signature,
      });
      setSettings(updated);
      setMessage({ type: 'success', text: 'Settings saved successfully' });
    } catch (err) {
      setMessage({ type: 'error', text: err instanceof Error ? err.message : 'Failed to save settings' });
    } finally {
      setSaving(false);
    }
  };

  const handleReIngest = async () => {
    setIngesting(true);
    setMessage(null);
    try {
      const result = await triggerIngest();
      setMessage({ type: 'success', text: result.message });
    } catch (err) {
      setMessage({ type: 'error', text: err instanceof Error ? err.message : 'Failed to trigger ingestion' });
    } finally {
      setIngesting(false);
    }
  };

  const toggleEmailType = (value: string) => {
    if (!settings) return;
    if (value === 'all') {
      setSettings({ ...settings, email_types_filter: ['all'] });
    } else {
      let newTypes = settings.email_types_filter.filter((t) => t !== 'all');
      if (newTypes.includes(value)) {
        newTypes = newTypes.filter((t) => t !== value);
      } else {
        newTypes = [...newTypes, value];
      }
      if (newTypes.length === 0) {
        newTypes = ['all'];
      }
      setSettings({ ...settings, email_types_filter: newTypes });
    }
  };

  if (loading) {
    return (
      <div style={styles.loadingContainer}>
        <p>Loading settings...</p>
      </div>
    );
  }

  if (!settings) {
    return (
      <div style={styles.loadingContainer}>
        <p>Failed to load settings</p>
        <Link href="/" style={styles.link}>Back to Dashboard</Link>
      </div>
    );
  }

  return (
    <>
      <Head>
        <title>Settings - AI Email Triage</title>
      </Head>
      <div style={styles.container}>
        <header style={styles.header}>
          <div>
            <Link href="/" style={styles.backLink}>&larr; Back to Dashboard</Link>
            <h1 style={styles.title}>Settings</h1>
            <p style={styles.subtitle}>Configure your email triage preferences</p>
          </div>
        </header>

        <main style={styles.main}>
          {message && (
            <div style={message.type === 'success' ? styles.success : styles.error}>
              {message.text}
            </div>
          )}

          <div style={styles.card}>
            {/* Email History Range */}
            <div style={styles.section}>
              <h2 style={styles.sectionTitle}>Email History Range</h2>
              <p style={styles.sectionDesc}>How far back should we look in your inbox?</p>
              <select
                style={styles.select}
                value={settings.ingest_since_days}
                onChange={(e) => setSettings({ ...settings, ingest_since_days: parseInt(e.target.value) })}
              >
                <option value={1}>Last 24 hours</option>
                <option value={7}>Last 7 days</option>
                <option value={30}>Last 30 days</option>
                <option value={90}>Last 90 days</option>
                <option value={0}>All emails</option>
              </select>
            </div>

            {/* Email Types */}
            <div style={styles.section}>
              <h2 style={styles.sectionTitle}>Email Types to Process</h2>
              <p style={styles.sectionDesc}>What types of emails should we process?</p>
              <div style={styles.checkboxGroup}>
                {EMAIL_TYPE_OPTIONS.map((option) => (
                  <label key={option.value} style={styles.checkboxLabel}>
                    <input
                      type="checkbox"
                      checked={settings.email_types_filter.includes(option.value)}
                      onChange={() => toggleEmailType(option.value)}
                      style={styles.checkbox}
                    />
                    {option.label}
                  </label>
                ))}
              </div>
            </div>

            {/* Auto-approve Threshold */}
            <div style={styles.section}>
              <h2 style={styles.sectionTitle}>Auto-Approve Threshold</h2>
              <p style={styles.sectionDesc}>Should we auto-send replies when AI confidence is very high?</p>
              <select
                style={styles.select}
                value={settings.auto_approve_threshold}
                onChange={(e) => setSettings({ ...settings, auto_approve_threshold: parseFloat(e.target.value) })}
              >
                <option value={0}>Never auto-send (always require approval)</option>
                <option value={0.95}>Auto-send when &gt;95% confident</option>
                <option value={0.9}>Auto-send when &gt;90% confident</option>
              </select>
            </div>

            {/* Reply Tone */}
            <div style={styles.section}>
              <h2 style={styles.sectionTitle}>Reply Tone</h2>
              <p style={styles.sectionDesc}>What tone should replies use?</p>
              <select
                style={styles.select}
                value={settings.reply_tone}
                onChange={(e) => setSettings({ ...settings, reply_tone: e.target.value as 'formal' | 'friendly' | 'neutral' })}
              >
                <option value="formal">Formal - Professional and polished</option>
                <option value="friendly">Friendly - Warm and approachable</option>
                <option value="neutral">Neutral - Balanced and straightforward</option>
              </select>
            </div>

            {/* Signature */}
            <div style={styles.section}>
              <h2 style={styles.sectionTitle}>Email Signature</h2>
              <p style={styles.sectionDesc}>What signature should we add to replies?</p>
              <textarea
                style={styles.textarea}
                value={settings.signature}
                onChange={(e) => setSettings({ ...settings, signature: e.target.value })}
                placeholder="Best regards,&#10;The Support Team"
                rows={4}
              />
            </div>

            {/* Actions */}
            <div style={styles.actions}>
              <button
                style={styles.saveButton}
                onClick={handleSave}
                disabled={saving}
              >
                {saving ? 'Saving...' : 'Save Changes'}
              </button>
              <button
                style={styles.ingestButton}
                onClick={handleReIngest}
                disabled={ingesting}
              >
                {ingesting ? 'Triggering...' : 'Re-run Ingestion'}
              </button>
            </div>
          </div>

          {/* Setup Info */}
          <div style={styles.infoCard}>
            <p style={styles.infoText}>
              Setup completed: {settings.setup_completed_at ? new Date(settings.setup_completed_at).toLocaleDateString() : 'Unknown'}
            </p>
          </div>
        </main>
      </div>
    </>
  );
}

const styles: Record<string, React.CSSProperties> = {
  loadingContainer: {
    minHeight: '100vh',
    display: 'flex',
    flexDirection: 'column' as const,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#f9fafb',
    gap: '16px',
  },
  link: {
    color: '#3b82f6',
    textDecoration: 'underline',
  },
  container: {
    minHeight: '100vh',
    backgroundColor: '#f9fafb',
  },
  header: {
    backgroundColor: 'white',
    borderBottom: '1px solid #e5e7eb',
    padding: '24px 32px',
  },
  backLink: {
    color: '#3b82f6',
    fontSize: '14px',
    textDecoration: 'none',
    display: 'block',
    marginBottom: '8px',
  },
  title: {
    fontSize: '28px',
    fontWeight: 700,
    margin: 0,
    color: '#111827',
  },
  subtitle: {
    fontSize: '14px',
    color: '#6b7280',
    margin: '4px 0 0 0',
  },
  main: {
    padding: '24px 32px',
    maxWidth: '800px',
    margin: '0 auto',
  },
  success: {
    padding: '12px 16px',
    backgroundColor: '#f0fdf4',
    color: '#16a34a',
    borderRadius: '6px',
    marginBottom: '16px',
    fontSize: '14px',
  },
  error: {
    padding: '12px 16px',
    backgroundColor: '#fef2f2',
    color: '#dc2626',
    borderRadius: '6px',
    marginBottom: '16px',
    fontSize: '14px',
  },
  card: {
    backgroundColor: 'white',
    borderRadius: '12px',
    padding: '32px',
    boxShadow: '0 1px 3px rgba(0, 0, 0, 0.1)',
  },
  section: {
    marginBottom: '28px',
  },
  sectionTitle: {
    fontSize: '16px',
    fontWeight: 600,
    margin: '0 0 4px 0',
    color: '#111827',
  },
  sectionDesc: {
    fontSize: '14px',
    color: '#6b7280',
    margin: '0 0 12px 0',
  },
  select: {
    width: '100%',
    padding: '10px 12px',
    fontSize: '15px',
    border: '1px solid #d1d5db',
    borderRadius: '6px',
    backgroundColor: 'white',
    cursor: 'pointer',
  },
  checkboxGroup: {
    display: 'flex',
    flexWrap: 'wrap' as const,
    gap: '12px',
  },
  checkboxLabel: {
    display: 'flex',
    alignItems: 'center',
    gap: '8px',
    padding: '8px 12px',
    border: '1px solid #e5e7eb',
    borderRadius: '6px',
    cursor: 'pointer',
    fontSize: '14px',
  },
  checkbox: {
    width: '16px',
    height: '16px',
    accentColor: '#3b82f6',
  },
  textarea: {
    width: '100%',
    padding: '12px',
    fontSize: '15px',
    border: '1px solid #d1d5db',
    borderRadius: '6px',
    resize: 'vertical' as const,
    fontFamily: 'inherit',
    lineHeight: '1.5',
  },
  actions: {
    display: 'flex',
    gap: '12px',
    paddingTop: '16px',
    borderTop: '1px solid #e5e7eb',
  },
  saveButton: {
    flex: 1,
    padding: '12px 24px',
    fontSize: '15px',
    backgroundColor: '#3b82f6',
    color: 'white',
    border: 'none',
    borderRadius: '6px',
    cursor: 'pointer',
    fontWeight: 500,
  },
  ingestButton: {
    padding: '12px 24px',
    fontSize: '15px',
    backgroundColor: 'white',
    color: '#374151',
    border: '1px solid #d1d5db',
    borderRadius: '6px',
    cursor: 'pointer',
    fontWeight: 500,
  },
  infoCard: {
    marginTop: '16px',
    padding: '12px 16px',
    backgroundColor: 'white',
    borderRadius: '8px',
    boxShadow: '0 1px 3px rgba(0, 0, 0, 0.1)',
  },
  infoText: {
    fontSize: '13px',
    color: '#6b7280',
    margin: 0,
  },
};
