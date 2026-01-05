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
  const supabase = getSupabaseServiceClient();

  const { data, error } = await supabase
    .from('client_settings')
    .select('email_address, email_provider, email_password_encrypted, microsoft_refresh_token_encrypted')
    .eq('client_id', clientId)
    .single();

  if (error || !data) {
    return null;
  }

  return {
    email_address: data.email_address || '',
    email_provider: data.email_provider || 'gmail',
    has_gmail_password: !!data.email_password_encrypted,
    has_microsoft_oauth: !!data.microsoft_refresh_token_encrypted,
  };
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
  const supabase = getSupabaseServiceClient();

  const { data, error } = await supabase
    .from('client_settings')
    .select('email_address, email_password_encrypted')
    .eq('client_id', clientId)
    .single();

  if (error || !data) {
    console.error('[GMAIL] Failed to get Gmail credentials:', error?.message);
    return {
      success: false,
      emails: [],
      error: 'Failed to get Gmail credentials',
      provider: 'gmail',
    };
  }

  if (!data.email_address || !data.email_password_encrypted) {
    console.error('[GMAIL] Gmail credentials incomplete');
    return {
      success: false,
      emails: [],
      error: 'Gmail credentials not configured. Please set up your email in Settings.',
      provider: 'gmail',
    };
  }

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

    return {
      success: true,
      emails,
      provider: 'gmail',
    };
  } catch (err) {
    const errorMsg = err instanceof Error ? err.message : 'Failed to fetch Gmail emails';
    console.error('[GMAIL] Fetch failed:', errorMsg);
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
  try {
    const accessToken = await MicrosoftGraph.getValidAccessToken(clientId);

    const graphEmails = await MicrosoftGraph.getEmails({
      accessToken,
      sinceDays,
      unreadOnly,
      top: maxEmails,
    });

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

    return {
      success: true,
      emails,
      provider: 'outlook',
    };
  } catch (err) {
    const errorMsg = err instanceof Error ? err.message : 'Failed to fetch Outlook emails';
    console.error('[OUTLOOK] Fetch failed:', errorMsg);
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
  const { clientId, sinceDays = 7, unreadOnly = false, maxEmails = 50 } = params;

  const config = await getClientEmailConfig(clientId);

  if (!config) {
    console.error('[FETCH] No email configuration found for client:', clientId);
    return {
      success: false,
      emails: [],
      error: 'Email settings not configured. Please set up your email in Settings.',
      provider: 'gmail',
    };
  }

  // Route to appropriate provider
  if (config.email_provider === 'outlook' && config.has_microsoft_oauth) {
    return fetchViaOutlook(clientId, sinceDays, unreadOnly, maxEmails);
  }

  if (config.email_provider === 'gmail' && config.has_gmail_password) {
    return fetchViaGmail(clientId, sinceDays, unreadOnly, maxEmails);
  }

  // No valid credentials found
  const providerName = config.email_provider === 'outlook' ? 'Microsoft Outlook' : 'Gmail';
  console.error('[FETCH] Credentials not configured for provider:', config.email_provider);
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
