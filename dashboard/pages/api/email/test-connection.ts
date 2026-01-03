import type { NextApiResponse } from 'next';
import Imap from 'imap';
import nodemailer from 'nodemailer';
import { withAuth, AuthenticatedRequest } from '@/lib/auth';

interface TestConnectionRequest {
  email_address: string;
  email_password: string;
  email_provider: 'gmail' | 'outlook';
}

interface EmailConfig {
  imap: {
    host: string;
    port: number;
  };
  smtp: {
    host: string;
    port: number;
  };
}

const EMAIL_CONFIGS: Record<string, EmailConfig> = {
  gmail: {
    imap: { host: 'imap.gmail.com', port: 993 },
    smtp: { host: 'smtp.gmail.com', port: 587 },
  },
  outlook: {
    imap: { host: 'imap-mail.outlook.com', port: 993 },
    smtp: { host: 'smtp-mail.outlook.com', port: 587 },
  },
};

async function testImapConnection(
  email: string,
  password: string,
  config: EmailConfig['imap']
): Promise<{ success: boolean; error?: string }> {
  return new Promise((resolve) => {
    const imap = new Imap({
      user: email,
      password: password,
      host: config.host,
      port: config.port,
      tls: true,
      tlsOptions: { rejectUnauthorized: false },
      connTimeout: 10000,
      authTimeout: 10000,
    });

    const timeout = setTimeout(() => {
      imap.end();
      resolve({ success: false, error: 'Connection timeout' });
    }, 15000);

    imap.once('ready', () => {
      clearTimeout(timeout);
      imap.end();
      resolve({ success: true });
    });

    imap.once('error', (err: Error) => {
      clearTimeout(timeout);
      imap.end();
      resolve({ success: false, error: err.message });
    });

    imap.connect();
  });
}

async function testSmtpConnection(
  email: string,
  password: string,
  config: EmailConfig['smtp']
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

  const config = EMAIL_CONFIGS[email_provider];
  if (!config) {
    return res.status(400).json({
      error: 'Invalid provider',
      message: 'email_provider must be "gmail" or "outlook"',
    });
  }

  // Test IMAP connection first
  const imapResult = await testImapConnection(
    email_address,
    email_password,
    config.imap
  );

  if (!imapResult.success) {
    let errorMessage = imapResult.error || 'IMAP connection failed';

    // Provide more helpful error messages for Outlook
    if (email_provider === 'outlook') {
      errorMessage = enhanceOutlookError(errorMessage);
    }

    return res.status(400).json({
      success: false,
      error: errorMessage,
      type: 'imap',
    });
  }

  // Test SMTP connection
  const smtpResult = await testSmtpConnection(
    email_address,
    email_password,
    config.smtp
  );

  if (!smtpResult.success) {
    let errorMessage = smtpResult.error || 'SMTP connection failed';

    // Provide more helpful error messages for Outlook
    if (email_provider === 'outlook') {
      errorMessage = enhanceOutlookError(errorMessage);
    }

    return res.status(400).json({
      success: false,
      error: errorMessage,
      type: 'smtp',
    });
  }

  return res.status(200).json({ success: true });
}

/**
 * Enhance error messages for Outlook users to explain that
 * Microsoft has deprecated basic auth for personal accounts.
 */
function enhanceOutlookError(error: string): string {
  const lowerError = error.toLowerCase();

  // Check for common auth-related errors
  if (
    lowerError.includes('forbidden') ||
    lowerError.includes('authentication failed') ||
    lowerError.includes('invalid credentials') ||
    lowerError.includes('auth') ||
    lowerError.includes('535') ||
    lowerError.includes('534') ||
    lowerError.includes('login') ||
    lowerError.includes('denied')
  ) {
    return `${error}. Note: Microsoft requires OAuth2 authentication for Outlook.com/Hotmail accounts. Please use the "Connect with Microsoft" button instead of app passwords.`;
  }

  return error;
}

export default withAuth(handler);
