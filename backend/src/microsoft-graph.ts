/**
 * Microsoft Graph API client for Outlook/Hotmail email access
 * Backend version - uses encryption module from backend
 */

import { decrypt, encrypt } from './utils/encryption';
import { createClient } from '@supabase/supabase-js';

const MICROSOFT_TOKEN_URL = 'https://login.microsoftonline.com/common/oauth2/v2.0/token';
const GRAPH_API_BASE = 'https://graph.microsoft.com/v1.0';

const MICROSOFT_SCOPES = [
  'openid',
  'profile',
  'email',
  'offline_access',
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

interface GraphEmailListResponse {
  value: GraphEmail[];
  '@odata.nextLink'?: string;
}

function getSupabase() {
  return createClient(
    process.env.SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_KEY!
  );
}

/**
 * Refresh an expired access token
 */
async function refreshAccessToken(params: {
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
    const error = await response.json() as { error_description?: string; error?: string };
    throw new Error(`Token refresh failed: ${error.error_description || error.error || 'Unknown error'}`);
  }

  return response.json() as Promise<MicrosoftTokens>;
}

/**
 * Get valid access token for a client, refreshing if needed
 */
export async function getValidAccessToken(clientId: string): Promise<string> {
  const supabase = getSupabase();

  const { data, error } = await supabase
    .from('client_settings')
    .select('microsoft_client_id, microsoft_client_secret_encrypted, microsoft_access_token_encrypted, microsoft_refresh_token_encrypted, microsoft_token_expires')
    .eq('client_id', clientId)
    .single();

  if (error || !data) {
    throw new Error('Failed to get Microsoft OAuth credentials');
  }

  if (!data.microsoft_access_token_encrypted || !data.microsoft_refresh_token_encrypted) {
    throw new Error('Microsoft OAuth not configured. Please connect your Outlook account.');
  }

  if (!data.microsoft_client_id || !data.microsoft_client_secret_encrypted) {
    throw new Error('Microsoft app credentials not configured.');
  }

  const accessToken = decrypt(data.microsoft_access_token_encrypted);
  const refreshToken = decrypt(data.microsoft_refresh_token_encrypted);
  const clientSecret = decrypt(data.microsoft_client_secret_encrypted);
  const expiresAt = data.microsoft_token_expires ? new Date(data.microsoft_token_expires) : null;

  // Check if token is expired (with 5 minute buffer)
  const now = new Date();
  const bufferMs = 5 * 60 * 1000;

  if (!expiresAt || now.getTime() > expiresAt.getTime() - bufferMs) {
    // Token expired or about to expire - refresh it
    console.log('Microsoft access token expired, refreshing...');

    const newTokens = await refreshAccessToken({
      refreshToken,
      clientId: data.microsoft_client_id,
      clientSecret,
    });

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

    return newTokens.access_token;
  }

  return accessToken;
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
  const { accessToken, sinceDays = 7, unreadOnly = true, top = 50 } = params;

  // Build filter
  const filters: string[] = [];

  if (unreadOnly) {
    filters.push('isRead eq false');
  }

  if (sinceDays > 0) {
    const sinceDate = new Date();
    sinceDate.setDate(sinceDate.getDate() - sinceDays);
    filters.push(`receivedDateTime ge ${sinceDate.toISOString()}`);
  }

  const queryParams = new URLSearchParams({
    $top: top.toString(),
    $orderby: 'receivedDateTime desc',
    $select: 'id,conversationId,subject,bodyPreview,body,from,toRecipients,receivedDateTime,isRead,internetMessageId',
  });

  if (filters.length > 0) {
    queryParams.set('$filter', filters.join(' and '));
  }

  const response = await fetch(
    `${GRAPH_API_BASE}/me/messages?${queryParams.toString()}`,
    {
      headers: {
        Authorization: `Bearer ${accessToken}`,
        'Content-Type': 'application/json',
      },
    }
  );

  if (!response.ok) {
    const error = await response.json() as { error?: { message?: string } };
    throw new Error(`Failed to fetch emails: ${error.error?.message || 'Unknown error'}`);
  }

  const data = await response.json() as GraphEmailListResponse;
  return data.value;
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
    const error = await response.json() as { error?: { message?: string } };
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
      const error = await response.json() as { error?: { message?: string } };
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
    const error = await response.json() as { error?: { message?: string } };
    throw new Error(`Failed to send email: ${error.error?.message || 'Unknown error'}`);
  }
}

/**
 * Extract plain text from HTML email body
 */
export function extractTextFromHtml(html: string): string {
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
