/**
 * Gmail IMAP client for fetching emails
 * Uses imapflow for IMAP connection
 */

import { ImapFlow } from 'imapflow';
import { simpleParser, ParsedMail } from 'mailparser';

const GMAIL_IMAP_HOST = 'imap.gmail.com';
const GMAIL_IMAP_PORT = 993;

export interface GmailCredentials {
  email: string;
  appPassword: string;
}

export interface NormalizedEmail {
  external_id: string;
  from_address: string;
  to_address: string;
  subject: string;
  body: string;
  received_at: Date;
}

/**
 * Extract plain text from email, handling both HTML and plain text
 */
function extractPlainText(parsed: ParsedMail): string {
  if (parsed.text) {
    return parsed.text.trim();
  }

  if (parsed.html) {
    // Basic HTML to text conversion
    return parsed.html
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

  return '';
}

/**
 * Fetch emails from Gmail via IMAP
 */
export async function fetchGmailEmails(params: {
  credentials: GmailCredentials;
  sinceDays?: number;
  unreadOnly?: boolean;
  maxEmails?: number;
}): Promise<NormalizedEmail[]> {
  const { credentials, sinceDays = 7, unreadOnly = false, maxEmails = 50 } = params;

  const client = new ImapFlow({
    host: GMAIL_IMAP_HOST,
    port: GMAIL_IMAP_PORT,
    secure: true,
    auth: {
      user: credentials.email,
      pass: credentials.appPassword,
    },
    logger: false,
  });

  const emails: NormalizedEmail[] = [];

  try {
    await client.connect();

    // Open INBOX
    await client.mailboxOpen('INBOX');

    // Build IMAP search query
    // We'll use imapflow's object format with correct property names
    // imapflow SearchObject uses: seen (boolean), since (Date), etc.

    // Calculate since date if needed
    let sinceDate: Date | null = null;
    if (sinceDays > 0) {
      sinceDate = new Date();
      sinceDate.setDate(sinceDate.getDate() - sinceDays);
      sinceDate.setHours(0, 0, 0, 0);
    }

    // Build the search query object for imapflow
    let searchQuery: Record<string, unknown>;

    if (sinceDays > 0 && unreadOnly && sinceDate) {
      searchQuery = {
        and: [
          { since: sinceDate },
          { seen: false }
        ]
      };
    } else if (sinceDays > 0 && sinceDate) {
      searchQuery = { since: sinceDate };
    } else if (unreadOnly) {
      searchQuery = { seen: false };
    } else {
      searchQuery = { all: true };
    }

    // Execute search
    let searchResult = await client.search(searchQuery, { uid: true });
    let searchResultArray = Array.isArray(searchResult) ? searchResult : [];

    // If combined query returns 0, try fallback with date-only
    if (searchResultArray.length === 0 && sinceDays > 0 && unreadOnly && sinceDate) {
      // Test date-only
      const dateOnlyResult = await client.search({ since: sinceDate }, { uid: true });
      const dateOnlyCount = Array.isArray(dateOnlyResult) ? dateOnlyResult.length : 0;

      // Test unseen-only
      const unseenOnlyResult = await client.search({ seen: false }, { uid: true });
      const unseenOnlyCount = Array.isArray(unseenOnlyResult) ? unseenOnlyResult.length : 0;

      // If SINCE works but combined doesn't, use SINCE results
      if (dateOnlyCount > 0 && unseenOnlyCount === 0) {
        return emails;
      } else if (dateOnlyCount > 0) {
        searchResultArray = Array.isArray(dateOnlyResult) ? dateOnlyResult : [];
      }
    }

    if (searchResultArray.length === 0) {
      return emails;
    }

    // Limit to maxEmails (take most recent, which are at the end)
    const messagesToFetch = searchResultArray.slice(-maxEmails);

    // Fetch each message
    for (const uid of messagesToFetch) {
      try {
        // Fetch message with full body
        const message = await client.fetchOne(uid.toString(), {
          source: true,
          uid: true,
        }, { uid: true });

        if (message && 'source' in message && message.source) {
          const parsed = await simpleParser(message.source);

          // Extract from address
          const fromAddress = parsed.from?.value?.[0]?.address || '';

          // Extract to address (first recipient)
          const toAddress = parsed.to
            ? (Array.isArray(parsed.to)
                ? parsed.to[0]?.value?.[0]?.address
                : parsed.to.value?.[0]?.address)
            : '';

          // Get message ID
          const messageId = parsed.messageId || `gmail-${uid}-${Date.now()}`;

          const normalizedEmail: NormalizedEmail = {
            external_id: messageId,
            from_address: fromAddress,
            to_address: toAddress || credentials.email,
            subject: parsed.subject || '(no subject)',
            body: extractPlainText(parsed),
            received_at: parsed.date || new Date(),
          };

          emails.push(normalizedEmail);
        }
      } catch (msgError) {
        console.error('[GMAIL-IMAP] Failed to parse message:', uid, msgError);
        // Continue with other messages
      }
    }

    return emails;
  } catch (err) {
    console.error('[GMAIL-IMAP] IMAP operation failed:', err instanceof Error ? err.message : err);
    throw err;
  } finally {
    await client.logout();
  }
}

/**
 * Test Gmail IMAP connection
 */
export async function testGmailConnection(credentials: GmailCredentials): Promise<{ success: boolean; error?: string }> {
  const client = new ImapFlow({
    host: GMAIL_IMAP_HOST,
    port: GMAIL_IMAP_PORT,
    secure: true,
    auth: {
      user: credentials.email,
      pass: credentials.appPassword,
    },
    logger: false,
  });

  try {
    await client.connect();
    await client.logout();
    return { success: true };
  } catch (err) {
    const errorMessage = err instanceof Error ? err.message : 'Unknown error';
    console.error('[GMAIL-IMAP] Test connection failed:', errorMessage);

    // Provide helpful error messages
    if (errorMessage.includes('AUTHENTICATIONFAILED') || errorMessage.includes('Invalid credentials')) {
      return {
        success: false,
        error: 'Authentication failed. Make sure you are using a Gmail App Password, not your regular password. Generate one at https://myaccount.google.com/apppasswords',
      };
    }

    if (errorMessage.includes('IMAP')) {
      return {
        success: false,
        error: 'IMAP access is not enabled. Enable IMAP in Gmail Settings > Forwarding and POP/IMAP.',
      };
    }

    return {
      success: false,
      error: errorMessage,
    };
  }
}
