import type { NextApiResponse } from 'next';
import nodemailer from 'nodemailer';
import { withAuth, AuthenticatedRequest } from '@/lib/auth';
import { testGmailConnection } from '@/lib/gmail-imap';

interface TestConnectionRequest {
  email_address: string;
  email_password: string;
  email_provider: 'gmail' | 'outlook';
}

interface SmtpConfig {
  host: string;
  port: number;
}

const SMTP_CONFIGS: Record<string, SmtpConfig> = {
  gmail: { host: 'smtp.gmail.com', port: 587 },
  outlook: { host: 'smtp-mail.outlook.com', port: 587 },
};

async function testSmtpConnection(
  email: string,
  password: string,
  config: SmtpConfig
): Promise<{ success: boolean; error?: string }> {
  return new Promise((resolve) => {
    const transporter = nodemailer.createTransport({
      host: config.host,
      port: config.port,
      secure: false,
      auth: {
        user: email,
        pass: password,
      },
      connectionTimeout: 10000,
    });

    transporter.verify((err: Error | null) => {
      if (err) {
        resolve({ success: false, error: err.message });
      } else {
        resolve({ success: true });
      }
      transporter.close();
    });
  });
}

async function handler(req: AuthenticatedRequest, res: NextApiResponse) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const { email_address, email_password, email_provider } =
    req.body as TestConnectionRequest;

  // Validate input
  if (!email_address || !email_password || !email_provider) {
    return res.status(400).json({
      error: 'Missing required fields',
      message: 'email_address, email_password, and email_provider are required',
    });
  }

  // Outlook should use OAuth, not app passwords
  if (email_provider === 'outlook') {
    return res.status(400).json({
      error: 'Outlook requires OAuth authentication',
      message: 'Please use the "Connect with Microsoft" button instead of entering credentials manually.',
    });
  }

  if (email_provider !== 'gmail') {
    return res.status(400).json({
      error: 'Invalid provider',
      message: 'email_provider must be "gmail" or "outlook"',
    });
  }

  // Test Gmail IMAP connection using imapflow
  console.log(`[test-connection] Testing Gmail IMAP for ${email_address}`);
  const imapResult = await testGmailConnection({
    email: email_address,
    appPassword: email_password,
  });

  if (!imapResult.success) {
    console.log(`[test-connection] Gmail IMAP failed: ${imapResult.error}`);
    return res.status(400).json({
      success: false,
      error: imapResult.error || 'IMAP connection failed',
      type: 'imap',
    });
  }

  console.log(`[test-connection] Gmail IMAP successful, testing SMTP...`);

  // Test SMTP connection
  const smtpConfig = SMTP_CONFIGS[email_provider];
  const smtpResult = await testSmtpConnection(
    email_address,
    email_password,
    smtpConfig
  );

  if (!smtpResult.success) {
    console.log(`[test-connection] Gmail SMTP failed: ${smtpResult.error}`);
    return res.status(400).json({
      success: false,
      error: smtpResult.error || 'SMTP connection failed',
      type: 'smtp',
    });
  }

  console.log(`[test-connection] All tests passed for ${email_address}`);
  return res.status(200).json({ success: true });
}

export default withAuth(handler);
