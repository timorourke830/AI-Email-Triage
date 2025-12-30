/**
 * Unified email fetcher service
 * Routes to appropriate provider (Gmail IMAP or Outlook Graph API)
 * based on client configuration
 */

import { getSupabaseServiceClient } from './supabase';
import { decrypt } from './encryption';
import { fetchGmailEmails, NormalizedEmail } from './gmail-imap';
import * as MicrosoftGraph from './microsoft-graph';

export interface ClientEmailConfig {
  email_address: string;
  email_provider: 'gmail' | 'outlook';
  has_gmail_password: boolean;
  has_microsoft_oauth: boolean;
}

export interface FetchResult {
  success: boolean;
  emails: NormalizedEmail[];
  error?: string;
  provider: 'gmail' | 'outlook';
}

/**
 * Get email configuration for a client
 */
export async function getClientEmailConfig(clientId: string): Promise<ClientEmailConfig | null> {
  const timestamp = new Date().toISOString();
  console.log(`[FETCH] ${timestamp} - Getting email config for client: ${clientId}`);

  const supabase = getSupabaseServiceClient();

  const { data, error } = await supabase
    .from('client_settings')
    .select('email_address, email_provider, email_password_encrypted, microsoft_refresh_token_encrypted')
    .eq('client_id', clientId)
    .single();

  if (error || !data) {
    console.log(`[FETCH] ${timestamp} - No email config found for client ${clientId}. Error: ${error?.message || 'no data'}`);
    return null;
  }

  const config = {
    email_address: data.email_address || '',
    email_provider: data.email_provider || 'gmail',
    has_gmail_password: !!data.email_password_encrypted,
    has_microsoft_oauth: !!data.microsoft_refresh_token_encrypted,
  };

  console.log(`[FETCH] ${timestamp} - Email config for client ${clientId}:`, {
    email_address: config.email_address || '(not set)',
    email_provider: config.email_provider,
    has_gmail_password: config.has_gmail_password,
    has_microsoft_oauth: config.has_microsoft_oauth,
  });

  return config;
}

/**
 * Extract plain text from HTML email body
 */
function extractTextFromHtml(html: string): string {
  return html
    .replace(/<style[^>]*>[\s\S]*?<\/style>/gi, '')
    .replace(/<script[^>]*>[\s\S]*?<\/script>/gi, '')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/\s+/g, ' ')
    .trim();
}

/**
 * Fetch emails via Gmail IMAP
 */
async function fetchViaGmail(
  clientId: string,
  sinceDays: number,
  unreadOnly: boolean,
  maxEmails: number
): Promise<FetchResult> {
  const timestamp = new Date().toISOString();
  console.log(`[GMAIL] ${timestamp} - Starting Gmail IMAP fetch for client ${clientId}`);
  console.log(`[GMAIL] ${timestamp} - Parameters: sinceDays=${sinceDays}, unreadOnly=${unreadOnly}, maxEmails=${maxEmails}`);

  const supabase = getSupabaseServiceClient();

  const { data, error } = await supabase
    .from('client_settings')
    .select('email_address, email_password_encrypted')
    .eq('client_id', clientId)
    .single();

  if (error || !data) {
    console.error(`[GMAIL] ${timestamp} - ERROR: Failed to get Gmail credentials. Error: ${error?.message || 'no data'}`);
    return {
      success: false,
      emails: [],
      error: 'Failed to get Gmail credentials',
      provider: 'gmail',
    };
  }

  if (!data.email_address || !data.email_password_encrypted) {
    console.error(`[GMAIL] ${timestamp} - ERROR: Gmail credentials incomplete. email_address=${!!data.email_address}, password=${!!data.email_password_encrypted}`);
    return {
      success: false,
      emails: [],
      error: 'Gmail credentials not configured. Please set up your email in Settings.',
      provider: 'gmail',
    };
  }

  console.log(`[GMAIL] ${timestamp} - Credentials found for ${data.email_address}. Attempting IMAP connection...`);

  try {
    const emails = await fetchGmailEmails({
      credentials: {
        email: data.email_address,
        appPassword: decrypt(data.email_password_encrypted),
      },
      sinceDays,
      unreadOnly,
      maxEmails,
    });

    console.log(`[GMAIL] ${timestamp} - SUCCESS: Fetched ${emails.length} emails from Gmail`);
    return {
      success: true,
      emails,
      provider: 'gmail',
    };
  } catch (err) {
    const errorMsg = err instanceof Error ? err.message : 'Failed to fetch Gmail emails';
    console.error(`[GMAIL] ${timestamp} - ERROR: Gmail fetch failed:`, errorMsg);
    if (err instanceof Error && err.stack) {
      console.error(`[GMAIL] ${timestamp} - Stack trace:`, err.stack);
    }
    return {
      success: false,
      emails: [],
      error: errorMsg,
      provider: 'gmail',
    };
  }
}

/**
 * Fetch emails via Microsoft Graph API
 */
async function fetchViaOutlook(
  clientId: string,
  sinceDays: number,
  unreadOnly: boolean,
  maxEmails: number
): Promise<FetchResult> {
  const timestamp = new Date().toISOString();
  console.log(`[OUTLOOK] ${timestamp} - Starting Microsoft Graph fetch for client ${clientId}`);
  console.log(`[OUTLOOK] ${timestamp} - Parameters: sinceDays=${sinceDays}, unreadOnly=${unreadOnly}, maxEmails=${maxEmails}`);

  try {
    console.log(`[OUTLOOK] ${timestamp} - Getting valid access token...`);
    const accessToken = await MicrosoftGraph.getValidAccessToken(clientId);
    console.log(`[OUTLOOK] ${timestamp} - Access token obtained (length: ${accessToken.length})`);

    console.log(`[OUTLOOK] ${timestamp} - Calling Graph API to fetch emails...`);
    const graphEmails = await MicrosoftGraph.getEmails({
      accessToken,
      sinceDays,
      unreadOnly,
      top: maxEmails,
    });

    console.log(`[OUTLOOK] ${timestamp} - Graph API returned ${graphEmails.length} emails`);

    // Convert Graph emails to normalized format
    const emails: NormalizedEmail[] = graphEmails.map((email) => ({
      external_id: email.internetMessageId || email.id,
      from_address: email.from?.emailAddress?.address || '',
      to_address: email.toRecipients?.[0]?.emailAddress?.address || '',
      subject: email.subject || '(no subject)',
      body: email.body.contentType === 'html'
        ? extractTextFromHtml(email.body.content)
        : email.body.content,
      received_at: new Date(email.receivedDateTime),
    }));

    console.log(`[OUTLOOK] ${timestamp} - SUCCESS: Normalized ${emails.length} emails from Outlook`);
    return {
      success: true,
      emails,
      provider: 'outlook',
    };
  } catch (err) {
    const errorMsg = err instanceof Error ? err.message : 'Failed to fetch Outlook emails';
    console.error(`[OUTLOOK] ${timestamp} - ERROR: Outlook fetch failed:`, errorMsg);
    if (err instanceof Error && err.stack) {
      console.error(`[OUTLOOK] ${timestamp} - Stack trace:`, err.stack);
    }
    return {
      success: false,
      emails: [],
      error: errorMsg,
      provider: 'outlook',
    };
  }
}

/**
 * Fetch emails for a client using their configured provider
 */
export async function fetchEmails(params: {
  clientId: string;
  sinceDays?: number;
  unreadOnly?: boolean;
  maxEmails?: number;
}): Promise<FetchResult> {
  const { clientId, sinceDays = 7, unreadOnly = true, maxEmails = 50 } = params;
  const timestamp = new Date().toISOString();

  console.log(`[FETCH] ${timestamp} - fetchEmails called for client ${clientId}`);
  console.log(`[FETCH] ${timestamp} - Parameters: sinceDays=${sinceDays}, unreadOnly=${unreadOnly}, maxEmails=${maxEmails}`);

  const config = await getClientEmailConfig(clientId);

  if (!config) {
    console.error(`[FETCH] ${timestamp} - ERROR: No email configuration found for client ${clientId}`);
    return {
      success: false,
      emails: [],
      error: 'Email settings not configured. Please set up your email in Settings.',
      provider: 'gmail',
    };
  }

  console.log(`[FETCH] ${timestamp} - Routing to provider: ${config.email_provider}`);

  // Route to appropriate provider
  if (config.email_provider === 'outlook' && config.has_microsoft_oauth) {
    console.log(`[FETCH] ${timestamp} - Using Microsoft Graph API (Outlook OAuth configured)`);
    return fetchViaOutlook(clientId, sinceDays, unreadOnly, maxEmails);
  }

  if (config.email_provider === 'gmail' && config.has_gmail_password) {
    console.log(`[FETCH] ${timestamp} - Using Gmail IMAP (app password configured)`);
    return fetchViaGmail(clientId, sinceDays, unreadOnly, maxEmails);
  }

  // No valid credentials found
  const providerName = config.email_provider === 'outlook' ? 'Microsoft Outlook' : 'Gmail';
  console.error(`[FETCH] ${timestamp} - ERROR: ${providerName} credentials not configured. Provider: ${config.email_provider}, OAuth: ${config.has_microsoft_oauth}, Password: ${config.has_gmail_password}`);
  return {
    success: false,
    emails: [],
    error: `${providerName} not connected. Please complete setup in Settings.`,
    provider: config.email_provider,
  };
}

/**
 * Check if client has valid email configuration
 */
export async function isEmailConfigured(clientId: string): Promise<boolean> {
  const config = await getClientEmailConfig(clientId);

  if (!config) {
    return false;
  }

  if (config.email_provider === 'outlook') {
    return config.has_microsoft_oauth;
  }

  if (config.email_provider === 'gmail') {
    return config.has_gmail_password;
  }

  return false;
}
