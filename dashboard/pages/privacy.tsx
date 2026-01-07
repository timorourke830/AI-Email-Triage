import Head from 'next/head';
import Link from 'next/link';
import { ArrowLeft, Mail } from 'lucide-react';

export default function PrivacyPolicy() {
  return (
    <>
      <Head>
        <title>Privacy Policy - AI Email Triage</title>
        <meta name="description" content="AI Email Triage Privacy Policy" />
      </Head>

      <div className="min-h-screen bg-slate-50 dark:bg-slate-900">
        {/* Header */}
        <header className="bg-white dark:bg-slate-800 border-b border-slate-200 dark:border-slate-700">
          <div className="max-w-3xl mx-auto px-6 py-4 flex items-center justify-between">
            <Link href="/" className="flex items-center gap-3">
              <div className="w-8 h-8 rounded-lg bg-primary-600 flex items-center justify-center">
                <Mail className="w-4 h-4 text-white" />
              </div>
              <span className="font-semibold text-slate-900 dark:text-white">
                AI Email Triage
              </span>
            </Link>
            <Link
              href="/"
              className="flex items-center gap-2 text-sm text-slate-600 hover:text-slate-900 dark:text-slate-400 dark:hover:text-white transition-colors"
            >
              <ArrowLeft className="w-4 h-4" />
              Back to Dashboard
            </Link>
          </div>
        </header>

        {/* Content */}
        <main className="max-w-3xl mx-auto px-6 py-12">
          <article className="prose prose-slate dark:prose-invert max-w-none">
            <h1 className="text-3xl font-bold text-slate-900 dark:text-white mb-2">
              Privacy Policy
            </h1>
            <p className="text-slate-500 dark:text-slate-400 text-sm mb-8">
              Last Updated: January 7, 2026
            </p>

            <section className="mb-8">
              <h2 className="text-xl font-semibold text-slate-900 dark:text-white mb-3">
                1. Introduction
              </h2>
              <p className="text-slate-600 dark:text-slate-300 leading-relaxed">
                AI Email Triage ("we," "our," or "the Service") is committed to protecting your privacy. This Privacy Policy explains how we collect, use, and safeguard your information when you use our Service.
              </p>
            </section>

            <section className="mb-8">
              <h2 className="text-xl font-semibold text-slate-900 dark:text-white mb-3">
                2. Information We Collect
              </h2>
              <div className="space-y-4">
                <div>
                  <h3 className="text-lg font-medium text-slate-800 dark:text-slate-200 mb-2">
                    Account Information
                  </h3>
                  <p className="text-slate-600 dark:text-slate-300 leading-relaxed">
                    Email address and name when you sign up.
                  </p>
                </div>
                <div>
                  <h3 className="text-lg font-medium text-slate-800 dark:text-slate-200 mb-2">
                    Email Data
                  </h3>
                  <p className="text-slate-600 dark:text-slate-300 leading-relaxed">
                    When you connect your email account, we access your emails to provide classification and draft reply services. This includes email content, sender information, subject lines, and timestamps.
                  </p>
                </div>
                <div>
                  <h3 className="text-lg font-medium text-slate-800 dark:text-slate-200 mb-2">
                    OAuth Tokens
                  </h3>
                  <p className="text-slate-600 dark:text-slate-300 leading-relaxed">
                    We store encrypted authentication tokens to maintain your email connection. We do not store your email password.
                  </p>
                </div>
                <div>
                  <h3 className="text-lg font-medium text-slate-800 dark:text-slate-200 mb-2">
                    Usage Data
                  </h3>
                  <p className="text-slate-600 dark:text-slate-300 leading-relaxed">
                    We may collect information about how you interact with the Service.
                  </p>
                </div>
              </div>
            </section>

            <section className="mb-8">
              <h2 className="text-xl font-semibold text-slate-900 dark:text-white mb-3">
                3. How We Use Your Information
              </h2>
              <p className="text-slate-600 dark:text-slate-300 leading-relaxed mb-3">
                We use your information to:
              </p>
              <ul className="list-disc list-inside text-slate-600 dark:text-slate-300 space-y-2">
                <li>Provide email classification and draft reply generation</li>
                <li>Authenticate your email account connection</li>
                <li>Send emails on your behalf (only with your explicit approval)</li>
                <li>Improve and maintain the Service</li>
              </ul>
            </section>

            <section className="mb-8">
              <h2 className="text-xl font-semibold text-slate-900 dark:text-white mb-3">
                4. AI Processing
              </h2>
              <p className="text-slate-600 dark:text-slate-300 leading-relaxed mb-3">
                Your emails are processed by artificial intelligence (Claude by Anthropic) to classify content and generate draft replies.
              </p>
              <ul className="list-disc list-inside text-slate-600 dark:text-slate-300 space-y-2">
                <li>Email content is sent to AI services for processing.</li>
                <li>AI-generated drafts are presented for your review before any action is taken.</li>
              </ul>
            </section>

            <section className="mb-8">
              <h2 className="text-xl font-semibold text-slate-900 dark:text-white mb-3">
                5. Data Storage and Security
              </h2>
              <ul className="list-disc list-inside text-slate-600 dark:text-slate-300 space-y-2">
                <li>Your data is stored securely using industry-standard encryption.</li>
                <li>OAuth tokens and sensitive credentials are encrypted at rest.</li>
                <li>We use Supabase for secure database hosting.</li>
                <li>We use Vercel for secure application hosting.</li>
              </ul>
            </section>

            <section className="mb-8">
              <h2 className="text-xl font-semibold text-slate-900 dark:text-white mb-3">
                6. Data Sharing
              </h2>
              <p className="text-slate-600 dark:text-slate-300 leading-relaxed mb-3">
                We do not sell your personal information. We may share data with:
              </p>
              <ul className="list-disc list-inside text-slate-600 dark:text-slate-300 space-y-2">
                <li>AI service providers (Anthropic) for email processing</li>
                <li>Email providers (Microsoft, Google) to access your email via authorized APIs</li>
                <li>Service providers necessary to operate the Service</li>
              </ul>
            </section>

            <section className="mb-8">
              <h2 className="text-xl font-semibold text-slate-900 dark:text-white mb-3">
                7. Data Retention
              </h2>
              <ul className="list-disc list-inside text-slate-600 dark:text-slate-300 space-y-2">
                <li>We retain your data for as long as your account is active.</li>
                <li>You may request deletion of your data at any time.</li>
                <li>Upon account deletion, we will remove your data within 30 days.</li>
              </ul>
            </section>

            <section className="mb-8">
              <h2 className="text-xl font-semibold text-slate-900 dark:text-white mb-3">
                8. Your Rights
              </h2>
              <p className="text-slate-600 dark:text-slate-300 leading-relaxed mb-3">
                You have the right to:
              </p>
              <ul className="list-disc list-inside text-slate-600 dark:text-slate-300 space-y-2">
                <li>Access your personal data</li>
                <li>Request correction of inaccurate data</li>
                <li>Request deletion of your data</li>
                <li>Revoke email access at any time through your email provider</li>
                <li>Export your data</li>
              </ul>
            </section>

            <section className="mb-8">
              <h2 className="text-xl font-semibold text-slate-900 dark:text-white mb-3">
                9. Third-Party Services
              </h2>
              <p className="text-slate-600 dark:text-slate-300 leading-relaxed mb-3">
                The Service integrates with:
              </p>
              <ul className="list-disc list-inside text-slate-600 dark:text-slate-300 space-y-2">
                <li>Microsoft Graph API (for Outlook/Microsoft email)</li>
                <li>Gmail API (for Google email)</li>
                <li>Anthropic Claude API (for AI processing)</li>
              </ul>
              <p className="text-slate-600 dark:text-slate-300 leading-relaxed mt-3">
                These services have their own privacy policies that govern their use of your data.
              </p>
            </section>

            <section className="mb-8">
              <h2 className="text-xl font-semibold text-slate-900 dark:text-white mb-3">
                10. Children's Privacy
              </h2>
              <p className="text-slate-600 dark:text-slate-300 leading-relaxed">
                The Service is not intended for users under 18 years of age. We do not knowingly collect information from children.
              </p>
            </section>

            <section className="mb-8">
              <h2 className="text-xl font-semibold text-slate-900 dark:text-white mb-3">
                11. Changes to This Policy
              </h2>
              <p className="text-slate-600 dark:text-slate-300 leading-relaxed">
                We may update this Privacy Policy at any time. We will notify you of significant changes via email or through the Service.
              </p>
            </section>

            <section className="mb-8">
              <h2 className="text-xl font-semibold text-slate-900 dark:text-white mb-3">
                12. Contact Us
              </h2>
              <p className="text-slate-600 dark:text-slate-300 leading-relaxed">
                For privacy-related questions or requests, contact:{' '}
                <a href="mailto:tim.orourke830@gmail.com" className="text-primary-600 hover:text-primary-700 dark:text-primary-400">
                  tim.orourke830@gmail.com
                </a>
              </p>
            </section>
          </article>

          {/* Footer links */}
          <div className="mt-12 pt-8 border-t border-slate-200 dark:border-slate-700">
            <div className="flex items-center justify-center gap-6 text-sm text-slate-500 dark:text-slate-400">
              <Link href="/terms" className="hover:text-slate-900 dark:hover:text-white transition-colors">
                Terms of Service
              </Link>
              <span>|</span>
              <Link href="/" className="hover:text-slate-900 dark:hover:text-white transition-colors">
                Dashboard
              </Link>
            </div>
          </div>
        </main>
      </div>
    </>
  );
}
