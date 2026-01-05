import nodemailer from 'nodemailer';
import type { Transporter } from 'nodemailer';
import type SMTPTransport from 'nodemailer/lib/smtp-transport';
import { getSupabaseServiceClient } from './supabase';
import { decrypt } from './encryption';
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

// Cache for client transporters
const clientTransporters: Map<string, Transporter<SMTPTransport.SentMessageInfo>> = new Map();

/**
 * Get email configuration for a client from database
 */
async function getClientEmailConfig(clientId: string): Promise<ClientEmailConfig> {
  const supabase = getSupabaseServiceClient();
  const { data, error } = await supabase
    .from('client_settings')
    .select('email_address, email_password_encrypted, email_provider')
    .eq('client_id', clientId)
    .single();

  if (error || !data) {
    throw new Error(`Failed to get client email config: ${error?.message || 'Not found'}`);
  }

  if (!data.email_address || !data.email_password_encrypted || !data.email_provider) {
    throw new Error('Client email credentials not configured');
  }

  return {
    email_address: data.email_address,
    email_password: decrypt(data.email_password_encrypted),
    email_provider: data.email_provider,
  };
}

/**
 * Create SMTP transporter for a client
 */
function createClientTransporter(config: ClientEmailConfig): Transporter<SMTPTransport.SentMessageInfo> {
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
 * Get email provider for a client
 */
async function getClientEmailProvider(clientId: string): Promise<'gmail' | 'outlook'> {
  const supabase = getSupabaseServiceClient();
  const { data, error } = await supabase
    .from('client_settings')
    .select('email_provider')
    .eq('client_id', clientId)
    .single();

  if (error || !data) {
    throw new Error(`Failed to get client email provider: ${error?.message || 'Not found'}`);
  }

  return data.email_provider || 'gmail';
}

/**
 * Send an email via Microsoft Graph API for Outlook accounts
 */
async function sendViaOutlook(options: SendEmailOptions, clientId: string): Promise<SendEmailResult> {
  try {
    // Get valid access token (handles refresh automatically)
    const accessToken = await MicrosoftGraph.getValidAccessToken(clientId);

    // Ensure subject has Re: prefix for replies
    let subject = options.subject;
    if (options.originalSubject && !subject) {
      subject = options.originalSubject.toLowerCase().startsWith('re:')
        ? options.originalSubject
        : `Re: ${options.originalSubject}`;
    }

    // Note: Microsoft Graph reply endpoint expects the Graph message ID, not the internet message ID
    // For now, we'll send as a new message to ensure delivery works
    // TODO: Store Graph message ID alongside external_id to enable proper threading
    await MicrosoftGraph.sendEmail({
      accessToken,
      to: options.to,
      subject: subject || 'No Subject',
      body: options.body,
      // Don't pass replyToMessageId since we have the internet message ID, not Graph ID
    });

    return {
      success: true,
      messageId: `graph-${Date.now()}`, // Graph API doesn't return message ID for sendMail
    };
  } catch (err) {
    const errorMessage = err instanceof Error ? err.message : 'Unknown Graph API error';
    console.error('[SMTP] Failed to send via Graph API:', errorMessage);

    return {
      success: false,
      error: errorMessage,
    };
  }
}

/**
 * Send an email via SMTP for Gmail accounts
 */
async function sendViaSmtp(options: SendEmailOptions, clientId: string): Promise<SendEmailResult> {
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

    return {
      success: true,
      messageId: info.messageId,
    };
  } catch (err) {
    const errorMessage = err instanceof Error ? err.message : 'Unknown SMTP error';
    console.error('[SMTP] Failed to send via SMTP:', errorMessage);

    // Clear cached transporter on error (might need reconfiguration)
    clientTransporters.delete(clientId);

    return {
      success: false,
      error: errorMessage,
    };
  }
}

/**
 * Send an email for a specific client
 * Routes to appropriate provider (Microsoft Graph for Outlook, SMTP for Gmail)
 */
export async function sendEmail(options: SendEmailOptions, clientId?: string): Promise<SendEmailResult> {
  if (!clientId) {
    return {
      success: false,
      error: 'Client ID is required for sending emails',
    };
  }

  try {
    // Check the client's email provider
    const provider = await getClientEmailProvider(clientId);

    if (provider === 'outlook') {
      return await sendViaOutlook(options, clientId);
    } else {
      return await sendViaSmtp(options, clientId);
    }
  } catch (err) {
    const errorMessage = err instanceof Error ? err.message : 'Unknown error';
    console.error('[SMTP] Error sending email:', errorMessage);

    return {
      success: false,
      error: errorMessage,
    };
  }
}

/**
 * Clear cached transporter for a client (useful after credential update)
 */
export function clearClientTransporterCache(clientId: string): void {
  clientTransporters.delete(clientId);
}
