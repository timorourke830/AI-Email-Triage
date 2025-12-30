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
  const { credentials, sinceDays = 7, unreadOnly = true, maxEmails = 50 } = params;
  const timestamp = new Date().toISOString();

  console.log(`[GMAIL-IMAP] ${timestamp} - Starting IMAP connection to ${GMAIL_IMAP_HOST}:${GMAIL_IMAP_PORT}`);
  console.log(`[GMAIL-IMAP] ${timestamp} - User: ${credentials.email}`);
  console.log(`[GMAIL-IMAP] ${timestamp} - Search params: sinceDays=${sinceDays}, unreadOnly=${unreadOnly}, maxEmails=${maxEmails}`);

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
    console.log(`[GMAIL-IMAP] ${timestamp} - Connecting to IMAP server...`);
    await client.connect();
    console.log(`[GMAIL-IMAP] ${timestamp} - Connected successfully`);

    // Open INBOX
    console.log(`[GMAIL-IMAP] ${timestamp} - Opening INBOX...`);
    const mailbox = await client.mailboxOpen('INBOX');
    console.log(`[GMAIL-IMAP] ${timestamp} - INBOX opened. Total messages: ${mailbox.exists}, Unseen: ${(mailbox as { unseen?: number }).unseen || 'unknown'}`);

    // Build IMAP search query
    // We'll use imapflow's object format with correct property names
    // imapflow SearchObject uses: seen (boolean), since (Date), etc.

    // Format date as DD-MMM-YYYY for IMAP SINCE command (e.g., "22-Dec-2025")
    const formatImapDate = (date: Date): string => {
      const months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
      const day = date.getDate();
      const month = months[date.getMonth()];
      const year = date.getFullYear();
      return `${day}-${month}-${year}`;
    };

    // Calculate since date if needed
    let sinceDate: Date | null = null;
    if (sinceDays > 0) {
      sinceDate = new Date();
      sinceDate.setDate(sinceDate.getDate() - sinceDays);
      sinceDate.setHours(0, 0, 0, 0);
      console.log(`[GMAIL-IMAP] ${timestamp} - Date filter: since ${formatImapDate(sinceDate)} (${sinceDate.toISOString()})`);
    }

    console.log(`[GMAIL-IMAP] ${timestamp} - Unread filter: ${unreadOnly ? 'UNSEEN only' : 'all messages'}`);

    // Build the search query object for imapflow
    // We need to be careful about how we combine criteria
    let searchQuery: Record<string, unknown>;

    if (sinceDays > 0 && unreadOnly && sinceDate) {
      // Both filters: use 'and' array with separate criteria
      searchQuery = {
        and: [
          { since: sinceDate },
          { seen: false }
        ]
      };
      console.log(`[GMAIL-IMAP] ${timestamp} - Combined query: SINCE ${formatImapDate(sinceDate)} AND UNSEEN`);
    } else if (sinceDays > 0 && sinceDate) {
      // Date only
      searchQuery = { since: sinceDate };
      console.log(`[GMAIL-IMAP] ${timestamp} - Date-only query: SINCE ${formatImapDate(sinceDate)}`);
    } else if (unreadOnly) {
      // Unread only
      searchQuery = { seen: false };
      console.log(`[GMAIL-IMAP] ${timestamp} - Unread-only query: UNSEEN`);
    } else {
      // No filters
      searchQuery = { all: true };
      console.log(`[GMAIL-IMAP] ${timestamp} - No filters: ALL`);
    }

    console.log(`[GMAIL-IMAP] ${timestamp} - Search query object:`, JSON.stringify(searchQuery, (key, value) => {
      if (value instanceof Date) return formatImapDate(value);
      return value;
    }));

    // Execute search
    console.log(`[GMAIL-IMAP] ${timestamp} - Executing IMAP search...`);
    let searchResult = await client.search(searchQuery, { uid: true });
    let searchResultArray = Array.isArray(searchResult) ? searchResult : [];

    console.log(`[GMAIL-IMAP] ${timestamp} - Search returned ${searchResultArray.length} UIDs`);

    // If combined query returns 0, try individual queries to diagnose
    if (searchResultArray.length === 0 && sinceDays > 0 && unreadOnly && sinceDate) {
      console.log(`[GMAIL-IMAP] ${timestamp} - Combined query returned 0, testing individual filters...`);

      // Test date-only
      const dateOnlyResult = await client.search({ since: sinceDate }, { uid: true });
      const dateOnlyCount = Array.isArray(dateOnlyResult) ? dateOnlyResult.length : 0;
      console.log(`[GMAIL-IMAP] ${timestamp} - SINCE only: ${dateOnlyCount} messages`);

      // Test unseen-only
      const unseenOnlyResult = await client.search({ seen: false }, { uid: true });
      const unseenOnlyCount = Array.isArray(unseenOnlyResult) ? unseenOnlyResult.length : 0;
      console.log(`[GMAIL-IMAP] ${timestamp} - UNSEEN only: ${unseenOnlyCount} messages`);

      // Test ALL
      const allResult = await client.search({ all: true }, { uid: true });
      const allCount = Array.isArray(allResult) ? allResult.length : 0;
      console.log(`[GMAIL-IMAP] ${timestamp} - ALL: ${allCount} messages`);

      // If SINCE works but combined doesn't, use SINCE results and filter will happen client-side
      if (dateOnlyCount > 0 && unseenOnlyCount === 0) {
        console.log(`[GMAIL-IMAP] ${timestamp} - No unread messages, returning empty`);
        return emails;
      } else if (dateOnlyCount > 0) {
        console.log(`[GMAIL-IMAP] ${timestamp} - Using SINCE-only results as fallback`);
        searchResultArray = Array.isArray(dateOnlyResult) ? dateOnlyResult : [];
      }
    }

    if (searchResultArray.length === 0) {
      console.log(`[GMAIL-IMAP] ${timestamp} - No matching messages found`);
      return emails;
    }

    console.log(`[GMAIL-IMAP] ${timestamp} - First 5 UIDs: ${searchResultArray.slice(0, 5).join(', ')}`);
    console.log(`[GMAIL-IMAP] ${timestamp} - Last 5 UIDs: ${searchResultArray.slice(-5).join(', ')}`);

    // Limit to maxEmails (take most recent, which are at the end)
    const messagesToFetch = searchResultArray.slice(-maxEmails);
    console.log(`[GMAIL-IMAP] ${timestamp} - Fetching ${messagesToFetch.length} of ${searchResultArray.length} messages (limit: ${maxEmails})`)

    // Fetch each message
    let fetchedCount = 0;
    let errorCount = 0;
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
          fetchedCount++;
        }
      } catch (msgError) {
        errorCount++;
        console.error(`[GMAIL-IMAP] ${timestamp} - ERROR: Failed to parse message ${uid}:`, msgError);
        // Continue with other messages
      }
    }

    console.log(`[GMAIL-IMAP] ${timestamp} - Fetch complete. Successfully parsed: ${fetchedCount}, Errors: ${errorCount}`);
    return emails;
  } catch (err) {
    console.error(`[GMAIL-IMAP] ${timestamp} - ERROR: IMAP operation failed:`, err instanceof Error ? err.message : err);
    if (err instanceof Error && err.stack) {
      console.error(`[GMAIL-IMAP] ${timestamp} - Stack trace:`, err.stack);
    }
    throw err;
  } finally {
    console.log(`[GMAIL-IMAP] ${timestamp} - Logging out from IMAP server`);
    await client.logout();
  }
}

/**
 * Test Gmail IMAP connection
 */
export async function testGmailConnection(credentials: GmailCredentials): Promise<{ success: boolean; error?: string }> {
  const timestamp = new Date().toISOString();
  console.log(`[GMAIL-IMAP] ${timestamp} - Testing connection for ${credentials.email}`);

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
    console.log(`[GMAIL-IMAP] ${timestamp} - Attempting connection...`);
    await client.connect();
    console.log(`[GMAIL-IMAP] ${timestamp} - Connection successful, logging out...`);
    await client.logout();
    console.log(`[GMAIL-IMAP] ${timestamp} - Test connection successful`);
    return { success: true };
  } catch (err) {
    const errorMessage = err instanceof Error ? err.message : 'Unknown error';
    console.error(`[GMAIL-IMAP] ${timestamp} - ERROR: Test connection failed:`, errorMessage);

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
