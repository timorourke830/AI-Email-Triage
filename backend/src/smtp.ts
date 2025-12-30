import nodemailer from 'nodemailer';
import type { Transporter } from 'nodemailer';
import type SMTPTransport from 'nodemailer/lib/smtp-transport';
import { createClient } from '@supabase/supabase-js';
import { decrypt } from './utils/encryption';
import * as MicrosoftGraph from './microsoft-graph';

export interface SendEmailOptions {
  to: string;
  subject: string;
  body: string;
  replyToMessageId?: string;
  originalSubject?: string;
}

export interface SendEmailResult {
  success: boolean;
  messageId?: string;
  error?: string;
}

interface ClientEmailConfig {
  email_address: string;
  email_password: string | null;
  email_provider: 'gmail' | 'outlook';
  has_microsoft_oauth: boolean;
}

interface SmtpConfig {
  host: string;
  port: number;
}

const SMTP_CONFIGS: Record<string, SmtpConfig> = {
  gmail: { host: 'smtp.gmail.com', port: 587 },
  outlook: { host: 'smtp-mail.outlook.com', port: 587 },
};

// Cache for client transporters
const clientTransporters: Map<string, Transporter<SMTPTransport.SentMessageInfo>> = new Map();

function getSupabase() {
  return createClient(
    process.env.SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_KEY!
  );
}

/**
 * Get email configuration for a client from database
 */
export async function getClientEmailConfig(clientId: string): Promise<ClientEmailConfig> {
  const supabase = getSupabase();
  const { data, error } = await supabase
    .from('client_settings')
    .select('email_address, email_password_encrypted, email_provider, microsoft_refresh_token_encrypted')
    .eq('client_id', clientId)
    .single();

  if (error || !data) {
    throw new Error(`Failed to get client email config: ${error?.message || 'Not found'}`);
  }

  if (!data.email_address || !data.email_provider) {
    throw new Error('Client email credentials not configured');
  }

  const hasMicrosoftOauth = !!data.microsoft_refresh_token_encrypted;

  // For Gmail, require app password; for Outlook with OAuth, it's optional
  if (data.email_provider === 'gmail' && !data.email_password_encrypted) {
    throw new Error('Gmail app password not configured');
  }

  return {
    email_address: data.email_address,
    email_password: data.email_password_encrypted ? decrypt(data.email_password_encrypted) : null,
    email_provider: data.email_provider,
    has_microsoft_oauth: hasMicrosoftOauth,
  };
}

/**
 * Create SMTP transporter for a client
 */
export function createClientTransporter(config: ClientEmailConfig): Transporter<SMTPTransport.SentMessageInfo> {
  if (!config.email_password) {
    throw new Error('SMTP requires an app password. Use OAuth for Outlook accounts.');
  }

  const smtpConfig = SMTP_CONFIGS[config.email_provider];
  if (!smtpConfig) {
    throw new Error(`Unknown email provider: ${config.email_provider}`);
  }

  return nodemailer.createTransport({
    host: smtpConfig.host,
    port: smtpConfig.port,
    secure: false, // Use STARTTLS
    auth: {
      user: config.email_address,
      pass: config.email_password,
    },
    tls: {
      rejectUnauthorized: false,
    },
  });
}

/**
 * Get or create SMTP transporter for a client (with caching)
 */
async function getClientTransporter(clientId: string): Promise<{ transporter: Transporter<SMTPTransport.SentMessageInfo>; fromEmail: string }> {
  // Check cache
  const cached = clientTransporters.get(clientId);
  if (cached) {
    // Re-fetch config for the email address but reuse transporter
    const config = await getClientEmailConfig(clientId);
    return { transporter: cached, fromEmail: config.email_address };
  }

  // Create new transporter
  const config = await getClientEmailConfig(clientId);
  const transporter = createClientTransporter(config);
  clientTransporters.set(clientId, transporter);

  return { transporter, fromEmail: config.email_address };
}

/**
 * Parse the reply subject and body from final_reply field
 * Format is typically: "Subject: Re: ...\n\n<body>"
 */
export function parseReplyContent(finalReply: string): { subject: string; body: string } {
  const lines = finalReply.split('\n');
  let subject = '';
  let bodyStartIndex = 0;

  // Check if first line is a Subject line
  if (lines[0]?.toLowerCase().startsWith('subject:')) {
    subject = lines[0].substring(8).trim();
    // Skip the subject line and any empty lines after it
    bodyStartIndex = 1;
    while (bodyStartIndex < lines.length && lines[bodyStartIndex].trim() === '') {
      bodyStartIndex++;
    }
  }

  const body = lines.slice(bodyStartIndex).join('\n').trim();

  return { subject, body };
}

/**
 * Send an email via SMTP for a specific client (Gmail only)
 */
async function sendEmailViaSMTP(clientId: string, options: SendEmailOptions): Promise<SendEmailResult> {
  const { transporter, fromEmail } = await getClientTransporter(clientId);

  // Build email headers for threading
  const headers: Record<string, string> = {};

  if (options.replyToMessageId) {
    headers['In-Reply-To'] = options.replyToMessageId;
    headers['References'] = options.replyToMessageId;
  }

  // Ensure subject has Re: prefix for replies
  let subject = options.subject;
  if (options.originalSubject && !subject) {
    subject = options.originalSubject.toLowerCase().startsWith('re:')
      ? options.originalSubject
      : `Re: ${options.originalSubject}`;
  }

  try {
    const info = await transporter.sendMail({
      from: fromEmail,
      to: options.to,
      subject: subject,
      text: options.body,
      replyTo: fromEmail,
      headers,
    });

    console.log(`Email sent successfully for client ${clientId}: ${info.messageId}`);

    return {
      success: true,
      messageId: info.messageId,
    };
  } catch (err) {
    const errorMessage = err instanceof Error ? err.message : 'Unknown SMTP error';
    console.error(`Failed to send email for client ${clientId}:`, errorMessage);

    // Clear cached transporter on error (might need reconfiguration)
    clientTransporters.delete(clientId);

    return {
      success: false,
      error: errorMessage,
    };
  }
}

/**
 * Send an email via Microsoft Graph API (Outlook only)
 */
async function sendEmailViaGraph(clientId: string, options: SendEmailOptions): Promise<SendEmailResult> {
  try {
    const accessToken = await MicrosoftGraph.getValidAccessToken(clientId);

    // Ensure subject has Re: prefix for replies
    let subject = options.subject;
    if (options.originalSubject && !subject) {
      subject = options.originalSubject.toLowerCase().startsWith('re:')
        ? options.originalSubject
        : `Re: ${options.originalSubject}`;
    }

    await MicrosoftGraph.sendEmail({
      accessToken,
      to: options.to,
      subject,
      body: options.body,
      replyToMessageId: options.replyToMessageId,
    });

    console.log(`Email sent successfully via Graph API for client ${clientId}`);

    return {
      success: true,
      messageId: `graph-${Date.now()}`, // Graph API doesn't return message ID on send
    };
  } catch (err) {
    const errorMessage = err instanceof Error ? err.message : 'Unknown Graph API error';
    console.error(`Failed to send email via Graph API for client ${clientId}:`, errorMessage);

    return {
      success: false,
      error: errorMessage,
    };
  }
}

/**
 * Send an email for a specific client - routes to appropriate method
 */
export async function sendEmailForClient(clientId: string, options: SendEmailOptions): Promise<SendEmailResult> {
  const config = await getClientEmailConfig(clientId);

  // Use Graph API for Outlook with OAuth
  if (config.email_provider === 'outlook' && config.has_microsoft_oauth) {
    return sendEmailViaGraph(clientId, options);
  }

  // Use SMTP for Gmail (or legacy Outlook with app password)
  if (config.email_password) {
    return sendEmailViaSMTP(clientId, options);
  }

  return {
    success: false,
    error: 'No valid email sending method configured',
  };
}

/**
 * Clear cached transporter for a client (useful after credential update)
 */
export function clearClientTransporterCache(clientId: string): void {
  clientTransporters.delete(clientId);
}
