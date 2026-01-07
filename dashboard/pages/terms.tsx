import Head from 'next/head';
import Link from 'next/link';
import { ArrowLeft, Mail } from 'lucide-react';

export default function TermsOfService() {
  return (
    <>
      <Head>
        <title>Terms of Service - AI Email Triage</title>
        <meta name="description" content="AI Email Triage Terms of Service" />
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
              Terms of Service
            </h1>
            <p className="text-slate-500 dark:text-slate-400 text-sm mb-8">
              Last Updated: January 7, 2026
            </p>

            <section className="mb-8">
              <h2 className="text-xl font-semibold text-slate-900 dark:text-white mb-3">
                1. Acceptance of Terms
              </h2>
              <p className="text-slate-600 dark:text-slate-300 leading-relaxed">
                By accessing or using AI Email Triage ("the Service"), you agree to be bound by these Terms of Service. If you do not agree to these terms, do not use the Service.
              </p>
            </section>

            <section className="mb-8">
              <h2 className="text-xl font-semibold text-slate-900 dark:text-white mb-3">
                2. Description of Service
              </h2>
              <p className="text-slate-600 dark:text-slate-300 leading-relaxed">
                AI Email Triage is a software application that connects to your email account (Gmail or Microsoft Outlook) to automatically classify incoming emails and generate draft replies using artificial intelligence. The Service requires your authorization to access your email account.
              </p>
            </section>

            <section className="mb-8">
              <h2 className="text-xl font-semibold text-slate-900 dark:text-white mb-3">
                3. Account and Access
              </h2>
              <ul className="list-disc list-inside text-slate-600 dark:text-slate-300 space-y-2">
                <li>You are responsible for maintaining the confidentiality of your account credentials.</li>
                <li>You must provide accurate information when connecting your email account.</li>
                <li>You may revoke access to your email account at any time through your email provider's settings.</li>
              </ul>
            </section>

            <section className="mb-8">
              <h2 className="text-xl font-semibold text-slate-900 dark:text-white mb-3">
                4. Acceptable Use
              </h2>
              <ul className="list-disc list-inside text-slate-600 dark:text-slate-300 space-y-2">
                <li>You agree not to use the Service to send spam, phishing, or malicious content.</li>
                <li>You agree not to use the Service for any illegal purpose.</li>
                <li>You are responsible for all content sent through the Service on your behalf.</li>
              </ul>
            </section>

            <section className="mb-8">
              <h2 className="text-xl font-semibold text-slate-900 dark:text-white mb-3">
                5. AI-Generated Content
              </h2>
              <ul className="list-disc list-inside text-slate-600 dark:text-slate-300 space-y-2">
                <li>The Service uses artificial intelligence to classify emails and generate draft replies.</li>
                <li>All AI-generated drafts require your review and approval before sending.</li>
                <li>You are responsible for reviewing and approving all outgoing messages.</li>
                <li>AI-generated content may not always be accurate.</li>
              </ul>
            </section>

            <section className="mb-8">
              <h2 className="text-xl font-semibold text-slate-900 dark:text-white mb-3">
                6. Data and Privacy
              </h2>
              <ul className="list-disc list-inside text-slate-600 dark:text-slate-300 space-y-2">
                <li>Your use of the Service is also governed by our <Link href="/privacy" className="text-primary-600 hover:text-primary-700 dark:text-primary-400">Privacy Policy</Link>.</li>
                <li>We access your email data only to provide the Service.</li>
                <li>We do not sell your personal data to third parties.</li>
              </ul>
            </section>

            <section className="mb-8">
              <h2 className="text-xl font-semibold text-slate-900 dark:text-white mb-3">
                7. Service Availability
              </h2>
              <ul className="list-disc list-inside text-slate-600 dark:text-slate-300 space-y-2">
                <li>The Service is provided "as is" without warranty of any kind.</li>
                <li>We do not guarantee uninterrupted or error-free operation.</li>
                <li>We may modify or discontinue the Service at any time.</li>
              </ul>
            </section>

            <section className="mb-8">
              <h2 className="text-xl font-semibold text-slate-900 dark:text-white mb-3">
                8. Limitation of Liability
              </h2>
              <p className="text-slate-600 dark:text-slate-300 leading-relaxed">
                To the maximum extent permitted by law, AI Email Triage and its operators shall not be liable for any indirect, incidental, special, consequential, or punitive damages arising from your use of the Service.
              </p>
            </section>

            <section className="mb-8">
              <h2 className="text-xl font-semibold text-slate-900 dark:text-white mb-3">
                9. Changes to Terms
              </h2>
              <p className="text-slate-600 dark:text-slate-300 leading-relaxed">
                We may update these Terms of Service at any time. Continued use of the Service after changes constitutes acceptance of the new terms.
              </p>
            </section>

            <section className="mb-8">
              <h2 className="text-xl font-semibold text-slate-900 dark:text-white mb-3">
                10. Contact
              </h2>
              <p className="text-slate-600 dark:text-slate-300 leading-relaxed">
                For questions about these Terms, contact:{' '}
                <a href="mailto:tim.orourke830@gmail.com" className="text-primary-600 hover:text-primary-700 dark:text-primary-400">
                  tim.orourke830@gmail.com
                </a>
              </p>
            </section>
          </article>

          {/* Footer links */}
          <div className="mt-12 pt-8 border-t border-slate-200 dark:border-slate-700">
            <div className="flex items-center justify-center gap-6 text-sm text-slate-500 dark:text-slate-400">
              <Link href="/privacy" className="hover:text-slate-900 dark:hover:text-white transition-colors">
                Privacy Policy
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
