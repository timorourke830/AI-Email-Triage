/**
 * Microsoft Graph API client for Outlook/Hotmail email access
 * Uses OAuth2 for authentication since Microsoft deprecated basic auth
 */

import { encrypt, decrypt } from './encryption';
import { getSupabaseServiceClient } from './supabase';

// Microsoft OAuth endpoints
const MICROSOFT_AUTH_URL = 'https://login.microsoftonline.com/common/oauth2/v2.0/authorize';
const MICROSOFT_TOKEN_URL = 'https://login.microsoftonline.com/common/oauth2/v2.0/token';
const GRAPH_API_BASE = 'https://graph.microsoft.com/v1.0';

// Required scopes for email access
export const MICROSOFT_SCOPES = [
  'openid',
  'profile',
  'email',
  'offline_access', // Required for refresh tokens
  'Mail.Read',
  'Mail.ReadWrite',
  'Mail.Send',
  'User.Read',
].join(' ');

export interface MicrosoftTokens {
  access_token: string;
  refresh_token: string;
  expires_in: number;
  token_type: string;
  scope: string;
}

export interface MicrosoftUserProfile {
  id: string;
  displayName: string;
  mail: string | null;
  userPrincipalName: string;
}

export interface GraphEmail {
  id: string;
  conversationId: string;
  subject: string;
  bodyPreview: string;
  body: {
    contentType: string;
    content: string;
  };
  from: {
    emailAddress: {
      name: string;
      address: string;
    };
  };
  toRecipients: Array<{
    emailAddress: {
      name: string;
      address: string;
    };
  }>;
  receivedDateTime: string;
  isRead: boolean;
  internetMessageId: string;
}

export interface GraphEmailListResponse {
  value: GraphEmail[];
  '@odata.nextLink'?: string;
}

/**
 * Generate the Microsoft OAuth authorization URL
 */
export function generateAuthUrl(params: {
  clientId: string;
  redirectUri: string;
  state: string;
}): string {
  const queryParams = new URLSearchParams({
    client_id: params.clientId,
    response_type: 'code',
    redirect_uri: params.redirectUri,
    response_mode: 'query',
    scope: MICROSOFT_SCOPES,
    state: params.state,
    prompt: 'consent', // Always show consent to ensure we get refresh token
  });

  return `${MICROSOFT_AUTH_URL}?${queryParams.toString()}`;
}

/**
 * Exchange authorization code for tokens
 */
export async function exchangeCodeForTokens(params: {
  code: string;
  clientId: string;
  clientSecret: string;
  redirectUri: string;
}): Promise<MicrosoftTokens> {
  const body = new URLSearchParams({
    client_id: params.clientId,
    client_secret: params.clientSecret,
    code: params.code,
    redirect_uri: params.redirectUri,
    grant_type: 'authorization_code',
    scope: MICROSOFT_SCOPES,
  });

  const response = await fetch(MICROSOFT_TOKEN_URL, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/x-www-form-urlencoded',
    },
    body: body.toString(),
  });

  if (!response.ok) {
    const error = await response.json();
    throw new Error(`Token exchange failed: ${error.error_description || error.error || 'Unknown error'}`);
  }

  return response.json();
}

/**
 * Refresh an expired access token
 */
export async function refreshAccessToken(params: {
  refreshToken: string;
  clientId: string;
  clientSecret: string;
}): Promise<MicrosoftTokens> {
  const body = new URLSearchParams({
    client_id: params.clientId,
    client_secret: params.clientSecret,
    refresh_token: params.refreshToken,
    grant_type: 'refresh_token',
    scope: MICROSOFT_SCOPES,
  });

  const response = await fetch(MICROSOFT_TOKEN_URL, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/x-www-form-urlencoded',
    },
    body: body.toString(),
  });

  if (!response.ok) {
    const error = await response.json();
    throw new Error(`Token refresh failed: ${error.error_description || error.error || 'Unknown error'}`);
  }

  return response.json();
}

/**
 * Get valid access token for a client, refreshing if needed
 */
export async function getValidAccessToken(clientId: string): Promise<string> {
  const timestamp = new Date().toISOString();
  console.log(`[OUTLOOK-GRAPH] ${timestamp} - Getting valid access token for client ${clientId}`);

  const supabase = getSupabaseServiceClient();

  const { data, error } = await supabase
    .from('client_settings')
    .select('microsoft_client_id, microsoft_client_secret_encrypted, microsoft_access_token_encrypted, microsoft_refresh_token_encrypted, microsoft_token_expires')
    .eq('client_id', clientId)
    .single();

  if (error || !data) {
    console.error(`[OUTLOOK-GRAPH] ${timestamp} - ERROR: Failed to get Microsoft OAuth credentials from DB. Error: ${error?.message || 'no data'}`);
    throw new Error('Failed to get Microsoft OAuth credentials');
  }

  console.log(`[OUTLOOK-GRAPH] ${timestamp} - DB data retrieved. Has access token: ${!!data.microsoft_access_token_encrypted}, Has refresh token: ${!!data.microsoft_refresh_token_encrypted}, Has client ID: ${!!data.microsoft_client_id}, Has client secret: ${!!data.microsoft_client_secret_encrypted}`);

  if (!data.microsoft_access_token_encrypted || !data.microsoft_refresh_token_encrypted) {
    console.error(`[OUTLOOK-GRAPH] ${timestamp} - ERROR: Microsoft OAuth not configured`);
    throw new Error('Microsoft OAuth not configured. Please connect your Outlook account.');
  }

  if (!data.microsoft_client_id || !data.microsoft_client_secret_encrypted) {
    console.error(`[OUTLOOK-GRAPH] ${timestamp} - ERROR: Microsoft app credentials not configured`);
    throw new Error('Microsoft app credentials not configured.');
  }

  const accessToken = decrypt(data.microsoft_access_token_encrypted);
  const refreshToken = decrypt(data.microsoft_refresh_token_encrypted);
  const clientSecret = decrypt(data.microsoft_client_secret_encrypted);
  const expiresAt = data.microsoft_token_expires ? new Date(data.microsoft_token_expires) : null;

  console.log(`[OUTLOOK-GRAPH] ${timestamp} - Token expires at: ${expiresAt?.toISOString() || 'unknown'}`);

  // Check if token is expired (with 5 minute buffer)
  const now = new Date();
  const bufferMs = 5 * 60 * 1000;

  if (!expiresAt || now.getTime() > expiresAt.getTime() - bufferMs) {
    // Token expired or about to expire - refresh it
    console.log(`[OUTLOOK-GRAPH] ${timestamp} - Access token expired or expiring soon, refreshing...`);

    try {
      const newTokens = await refreshAccessToken({
        refreshToken,
        clientId: data.microsoft_client_id,
        clientSecret,
      });

      console.log(`[OUTLOOK-GRAPH] ${timestamp} - Token refreshed successfully. New token expires in ${newTokens.expires_in} seconds`);

      // Calculate new expiry
      const newExpiresAt = new Date(Date.now() + newTokens.expires_in * 1000);

      // Update stored tokens
      await supabase
        .from('client_settings')
        .update({
          microsoft_access_token_encrypted: encrypt(newTokens.access_token),
          microsoft_refresh_token_encrypted: encrypt(newTokens.refresh_token),
          microsoft_token_expires: newExpiresAt.toISOString(),
        })
        .eq('client_id', clientId);

      console.log(`[OUTLOOK-GRAPH] ${timestamp} - Updated tokens in database`);
      return newTokens.access_token;
    } catch (err) {
      console.error(`[OUTLOOK-GRAPH] ${timestamp} - ERROR: Failed to refresh token:`, err instanceof Error ? err.message : err);
      throw err;
    }
  }

  console.log(`[OUTLOOK-GRAPH] ${timestamp} - Using existing valid access token`);
  return accessToken;
}

/**
 * Get user profile from Microsoft Graph
 */
export async function getUserProfile(accessToken: string): Promise<MicrosoftUserProfile> {
  const response = await fetch(`${GRAPH_API_BASE}/me`, {
    headers: {
      Authorization: `Bearer ${accessToken}`,
    },
  });

  if (!response.ok) {
    const error = await response.json();
    throw new Error(`Failed to get user profile: ${error.error?.message || 'Unknown error'}`);
  }

  return response.json();
}

/**
 * Fetch emails from inbox via Microsoft Graph API
 */
export async function getEmails(params: {
  accessToken: string;
  sinceDays?: number;
  unreadOnly?: boolean;
  top?: number;
}): Promise<GraphEmail[]> {
  const { accessToken, sinceDays = 7, unreadOnly = false, top = 50 } = params;
  const timestamp = new Date().toISOString();

  console.log(`[OUTLOOK-GRAPH] ${timestamp} - Fetching emails from Graph API`);
  console.log(`[OUTLOOK-GRAPH] ${timestamp} - Parameters: sinceDays=${sinceDays}, unreadOnly=${unreadOnly}, top=${top}`);

  // Build filter
  const filters: string[] = [];

  if (unreadOnly) {
    filters.push('isRead eq false');
  }

  if (sinceDays > 0) {
    const sinceDate = new Date();
    sinceDate.setDate(sinceDate.getDate() - sinceDays);
    filters.push(`receivedDateTime ge ${sinceDate.toISOString()}`);
    console.log(`[OUTLOOK-GRAPH] ${timestamp} - Filtering since: ${sinceDate.toISOString()}`);
  }

  const queryParams = new URLSearchParams({
    $top: top.toString(),
    $orderby: 'receivedDateTime desc',
    $select: 'id,conversationId,subject,bodyPreview,body,from,toRecipients,receivedDateTime,isRead,internetMessageId',
  });

  if (filters.length > 0) {
    queryParams.set('$filter', filters.join(' and '));
  }

  const url = `${GRAPH_API_BASE}/me/messages?${queryParams.toString()}`;
  console.log(`[OUTLOOK-GRAPH] ${timestamp} - Calling: GET ${url.substring(0, 100)}...`);

  const response = await fetch(url, {
    headers: {
      Authorization: `Bearer ${accessToken}`,
      'Content-Type': 'application/json',
    },
  });

  console.log(`[OUTLOOK-GRAPH] ${timestamp} - Response status: ${response.status} ${response.statusText}`);

  if (!response.ok) {
    const error = await response.json();
    console.error(`[OUTLOOK-GRAPH] ${timestamp} - ERROR: Failed to fetch emails. Status: ${response.status}, Error:`, error);
    throw new Error(`Failed to fetch emails: ${error.error?.message || 'Unknown error'}`);
  }

  const data: GraphEmailListResponse = await response.json();
  console.log(`[OUTLOOK-GRAPH] ${timestamp} - SUCCESS: Retrieved ${data.value.length} emails from Graph API`);

  if (data.value.length > 0) {
    console.log(`[OUTLOOK-GRAPH] ${timestamp} - First email subject: "${data.value[0].subject?.substring(0, 50)}..."`);
  }

  return data.value;
}

/**
 * Get a single email by ID
 */
export async function getEmail(accessToken: string, messageId: string): Promise<GraphEmail> {
  const response = await fetch(
    `${GRAPH_API_BASE}/me/messages/${messageId}`,
    {
      headers: {
        Authorization: `Bearer ${accessToken}`,
      },
    }
  );

  if (!response.ok) {
    const error = await response.json();
    throw new Error(`Failed to get email: ${error.error?.message || 'Unknown error'}`);
  }

  return response.json();
}

/**
 * Mark an email as read
 */
export async function markAsRead(accessToken: string, messageId: string): Promise<void> {
  const response = await fetch(
    `${GRAPH_API_BASE}/me/messages/${messageId}`,
    {
      method: 'PATCH',
      headers: {
        Authorization: `Bearer ${accessToken}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ isRead: true }),
    }
  );

  if (!response.ok) {
    const error = await response.json();
    throw new Error(`Failed to mark email as read: ${error.error?.message || 'Unknown error'}`);
  }
}

/**
 * Send an email via Microsoft Graph API
 */
export async function sendEmail(params: {
  accessToken: string;
  to: string;
  subject: string;
  body: string;
  replyToMessageId?: string;
}): Promise<void> {
  const { accessToken, to, subject, body, replyToMessageId } = params;

  // If this is a reply, use the reply endpoint
  if (replyToMessageId) {
    const response = await fetch(
      `${GRAPH_API_BASE}/me/messages/${replyToMessageId}/reply`,
      {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${accessToken}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          comment: body,
        }),
      }
    );

    if (!response.ok) {
      const error = await response.json();
      throw new Error(`Failed to send reply: ${error.error?.message || 'Unknown error'}`);
    }

    return;
  }

  // Send new email
  const message = {
    message: {
      subject,
      body: {
        contentType: 'Text',
        content: body,
      },
      toRecipients: [
        {
          emailAddress: {
            address: to,
          },
        },
      ],
    },
    saveToSentItems: true,
  };

  const response = await fetch(`${GRAPH_API_BASE}/me/sendMail`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${accessToken}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(message),
  });

  if (!response.ok) {
    const error = await response.json();
    throw new Error(`Failed to send email: ${error.error?.message || 'Unknown error'}`);
  }
}

/**
 * Test the OAuth connection by fetching user profile
 */
export async function testConnection(accessToken: string): Promise<{ success: boolean; email?: string; error?: string }> {
  try {
    const profile = await getUserProfile(accessToken);
    return {
      success: true,
      email: profile.mail || profile.userPrincipalName,
    };
  } catch (err) {
    return {
      success: false,
      error: err instanceof Error ? err.message : 'Connection test failed',
    };
  }
}
