import 'dotenv/config';
import Imap from 'imap';
import { simpleParser, ParsedMail } from 'mailparser';
import { createClient } from '@supabase/supabase-js';
import { decrypt } from './utils/encryption';
import * as MicrosoftGraph from './microsoft-graph';

interface ClientCredentials {
  email_address: string;
  email_password: string | null; // null for OAuth
  email_provider: 'gmail' | 'outlook';
  // Microsoft OAuth tokens (for Outlook)
  has_microsoft_oauth: boolean;
}

// Credentials type for IMAP (requires password)
interface ImapCredentials {
  email_address: string;
  email_password: string;
  email_provider: 'gmail' | 'outlook';
}

interface EmailConfig {
  imap: {
    host: string;
    port: number;
  };
}

const EMAIL_CONFIGS: Record<string, EmailConfig> = {
  gmail: {
    imap: { host: 'imap.gmail.com', port: 993 },
  },
  outlook: {
    imap: { host: 'imap-mail.outlook.com', port: 993 },
  },
};

/**
 * Parse CLI arguments for --client and --since flags
 * Usage: pnpm ingest --client <client_id> --since 7
 */
function parseCliArgs(): { clientId: string | null; sinceDays: number | null } {
  const args = process.argv.slice(2);

  // Parse --client
  let clientId: string | null = null;
  const clientIndex = args.indexOf('--client');
  if (clientIndex !== -1 && args[clientIndex + 1]) {
    clientId = args[clientIndex + 1];
  }

  // Parse --since
  let sinceDays: number | null = null;
  const sinceIndex = args.indexOf('--since');
  if (sinceIndex !== -1 && args[sinceIndex + 1]) {
    const days = parseInt(args[sinceIndex + 1], 10);
    if (!isNaN(days) && days >= 0) {
      sinceDays = days;
    }
  }

  return { clientId, sinceDays };
}

function getSupabase() {
  return createClient(
    process.env.SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_KEY!
  );
}

/**
 * Get client credentials from database
 */
async function getClientCredentials(clientId: string): Promise<ClientCredentials> {
  const supabase = getSupabase();
  const { data, error } = await supabase
    .from('client_settings')
    .select('email_address, email_password_encrypted, email_provider, email_credentials_verified, microsoft_refresh_token_encrypted')
    .eq('client_id', clientId)
    .single();

  if (error || !data) {
    throw new Error(`Failed to get client settings: ${error?.message || 'Not found'}`);
  }

  if (!data.email_credentials_verified) {
    throw new Error('Email credentials have not been verified. Please complete setup first.');
  }

  if (!data.email_address || !data.email_provider) {
    throw new Error('Missing email credentials. Please configure email in setup.');
  }

  // Check if using Microsoft OAuth (for Outlook)
  const hasMicrosoftOauth = !!data.microsoft_refresh_token_encrypted;

  // For Gmail, we need app password; for Outlook with OAuth, we don't
  if (data.email_provider === 'gmail' && !data.email_password_encrypted) {
    throw new Error('Missing Gmail app password. Please configure email in setup.');
  }

  // Decrypt the password if it exists (Gmail)
  const password = data.email_password_encrypted ? decrypt(data.email_password_encrypted) : null;

  return {
    email_address: data.email_address,
    email_password: password,
    email_provider: data.email_provider,
    has_microsoft_oauth: hasMicrosoftOauth,
  };
}

/**
 * Fetch ingest_since_days from client_settings
 */
async function getIngestSinceDays(clientId: string): Promise<number> {
  const supabase = getSupabase();
  const { data } = await supabase
    .from('client_settings')
    .select('ingest_since_days')
    .eq('client_id', clientId)
    .single();

  return data?.ingest_since_days ?? 7; // Default to 7 days
}

/**
 * Calculate the "since" date for IMAP search
 */
function calculateSinceDate(sinceDays: number): Date | null {
  if (sinceDays === 0) {
    return null; // 0 means fetch all emails
  }
  const date = new Date();
  date.setDate(date.getDate() - sinceDays);
  return date;
}

/**
 * Format date for IMAP SINCE search (DD-Mon-YYYY)
 */
function formatImapDate(date: Date): string {
  const months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
  return `${date.getDate()}-${months[date.getMonth()]}-${date.getFullYear()}`;
}

interface IngestedEmail {
  messageId: string;
  from: string;
  to: string;
  subject: string;
  body: string;
  date: Date;
}

/**
 * Extract plain text from email, falling back to stripped HTML
 */
function extractBody(parsed: ParsedMail): string {
  if (parsed.text) {
    return parsed.text.trim();
  }

  if (parsed.html) {
    // Strip HTML tags and decode entities
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
 * Extract email address from address object or string
 */
function extractEmailAddress(addressField: ParsedMail['from']): string {
  if (!addressField) return '';

  if (Array.isArray(addressField.value)) {
    const first = addressField.value[0];
    return first?.address || '';
  }

  return addressField.text || '';
}

/**
 * Parse a single email message
 */
async function parseEmail(buffer: Buffer): Promise<IngestedEmail | null> {
  try {
    const parsed = await simpleParser(buffer);

    const from = extractEmailAddress(parsed.from);
    const to = parsed.to
      ? (Array.isArray(parsed.to)
          ? extractEmailAddress(parsed.to[0] as ParsedMail['from'])
          : extractEmailAddress(parsed.to as ParsedMail['from']))
      : '';

    if (!from || !parsed.subject) {
      console.log('Skipping email: missing from or subject');
      return null;
    }

    return {
      messageId: parsed.messageId || `generated-${Date.now()}-${Math.random().toString(36).slice(2)}`,
      from,
      to,
      subject: parsed.subject || '(No Subject)',
      body: extractBody(parsed),
      date: parsed.date || new Date(),
    };
  } catch (err) {
    console.error('Failed to parse email:', err);
    return null;
  }
}

/**
 * Check if email already exists in database
 */
async function emailExists(supabase: ReturnType<typeof getSupabase>, messageId: string): Promise<boolean> {
  const { data } = await supabase
    .from('emails')
    .select('id')
    .eq('external_id', messageId)
    .single();

  return !!data;
}

/**
 * Insert email into Supabase
 */
async function insertEmail(
  supabase: ReturnType<typeof getSupabase>,
  clientId: string,
  email: IngestedEmail
): Promise<string | null> {
  const { data, error } = await supabase
    .from('emails')
    .insert({
      client_id: clientId,
      external_id: email.messageId,
      from_address: email.from,
      to_address: email.to,
      subject: email.subject,
      body: email.body,
      status: 'pending',
      created_at: email.date.toISOString(),
    })
    .select('id')
    .single();

  if (error) {
    console.error('Failed to insert email:', error.message);
    return null;
  }

  // Create audit log entry
  await supabase.from('audit_logs').insert({
    email_id: data.id,
    action: 'email_ingested',
    actor: 'imap_ingest',
    details: {
      from: email.from,
      subject: email.subject,
      message_id: email.messageId,
    },
  });

  return data.id;
}

/**
 * Fetch and process unread emails via IMAP
 */
async function fetchEmails(clientId: string, credentials: ImapCredentials, sinceDays: number): Promise<void> {
  const supabase = getSupabase();
  const sinceDate = calculateSinceDate(sinceDays);

  const emailConfig = EMAIL_CONFIGS[credentials.email_provider];
  if (!emailConfig) {
    throw new Error(`Unknown email provider: ${credentials.email_provider}`);
  }

  if (sinceDate) {
    console.log(`Fetching emails from the last ${sinceDays} days (since ${formatImapDate(sinceDate)})`);
  } else {
    console.log('Fetching all unread emails (no date filter)');
  }

  const imapConfig: Imap.Config = {
    user: credentials.email_address,
    password: credentials.email_password,
    host: emailConfig.imap.host,
    port: emailConfig.imap.port,
    tls: true,
    tlsOptions: {
      rejectUnauthorized: false,
    },
  };

  console.log(`Connecting to IMAP (${emailConfig.imap.host}) as ${credentials.email_address}...`);

  const imap = new Imap(imapConfig);

  return new Promise((resolve, reject) => {
    const processedUids: number[] = [];
    let totalProcessed = 0;
    let totalInserted = 0;
    let totalSkipped = 0;

    imap.once('ready', () => {
      console.log('IMAP connection established');

      imap.openBox('INBOX', false, (err, box) => {
        if (err) {
          console.error('Failed to open inbox:', err);
          imap.end();
          reject(err);
          return;
        }

        console.log(`Inbox opened: ${box.messages.total} total messages, ${box.messages.unseen} unread`);

        if (box.messages.unseen === 0) {
          console.log('No unread messages to process');
          imap.end();
          resolve();
          return;
        }

        // Build search criteria
        const searchCriteria: (string | string[])[] = ['UNSEEN'];
        if (sinceDate) {
          searchCriteria.push(['SINCE', formatImapDate(sinceDate)]);
        }

        // Search for unread messages
        imap.search(searchCriteria, (searchErr, uids) => {
          if (searchErr) {
            console.error('Search failed:', searchErr);
            imap.end();
            reject(searchErr);
            return;
          }

          if (uids.length === 0) {
            console.log('No unread messages found');
            imap.end();
            resolve();
            return;
          }

          console.log(`Found ${uids.length} unread messages`);

          const fetch = imap.fetch(uids, {
            bodies: '',
            struct: true,
          });

          const emailPromises: Promise<void>[] = [];

          fetch.on('message', (msg, seqno) => {
            let uid: number | undefined;

            msg.on('attributes', (attrs) => {
              uid = attrs.uid;
            });

            msg.on('body', (stream) => {
              const chunks: Buffer[] = [];

              stream.on('data', (chunk: Buffer) => {
                chunks.push(chunk);
              });

              stream.once('end', () => {
                const buffer = Buffer.concat(chunks);

                const processPromise = (async () => {
                  const email = await parseEmail(buffer);

                  if (!email) {
                    console.log(`  [${seqno}] Failed to parse email`);
                    return;
                  }

                  totalProcessed++;

                  // Check for duplicates
                  const exists = await emailExists(supabase, email.messageId);
                  if (exists) {
                    console.log(`  [${seqno}] Skipping duplicate: ${email.subject}`);
                    totalSkipped++;
                    if (uid) processedUids.push(uid);
                    return;
                  }

                  // Insert into database
                  const insertedId = await insertEmail(supabase, clientId, email);

                  if (insertedId) {
                    console.log(`  [${seqno}] Inserted: ${email.subject} (${insertedId})`);
                    totalInserted++;
                    if (uid) processedUids.push(uid);
                  } else {
                    console.log(`  [${seqno}] Failed to insert: ${email.subject}`);
                  }
                })();

                emailPromises.push(processPromise);
              });
            });
          });

          fetch.once('error', (fetchErr) => {
            console.error('Fetch error:', fetchErr);
          });

          fetch.once('end', async () => {
            console.log('Fetch complete, waiting for processing...');

            try {
              await Promise.all(emailPromises);

              console.log(`\nProcessing complete:`);
              console.log(`  Total processed: ${totalProcessed}`);
              console.log(`  Inserted: ${totalInserted}`);
              console.log(`  Skipped (duplicates): ${totalSkipped}`);

              // Mark processed emails as read
              if (processedUids.length > 0) {
                console.log(`\nMarking ${processedUids.length} emails as read...`);

                imap.addFlags(processedUids, ['\\Seen'], (flagErr) => {
                  if (flagErr) {
                    console.error('Failed to mark emails as read:', flagErr);
                  } else {
                    console.log('Emails marked as read');
                  }

                  imap.end();
                });
              } else {
                imap.end();
              }
            } catch (processErr) {
              console.error('Processing error:', processErr);
              imap.end();
            }
          });
        });
      });
    });

    imap.once('error', (err: Error & { source?: string }) => {
      console.error('IMAP error:', err);

      if (err.source === 'authentication') {
        console.error('\n=== AUTHENTICATION FAILED ===');
        console.error('Please ensure you are using an App Password, not your regular password.');
        console.error('=============================\n');
      }

      reject(err);
    });

    imap.once('end', () => {
      console.log('IMAP connection closed');
      resolve();
    });

    imap.connect();
  });
}

/**
 * Fetch and process emails via Microsoft Graph API (for Outlook)
 */
async function fetchEmailsViaGraph(clientId: string, sinceDays: number): Promise<void> {
  const supabase = getSupabase();

  console.log(`Fetching emails via Microsoft Graph API...`);

  // Get access token (will refresh if needed)
  const accessToken = await MicrosoftGraph.getValidAccessToken(clientId);

  // Fetch unread emails
  const graphEmails = await MicrosoftGraph.getEmails({
    accessToken,
    sinceDays,
    unreadOnly: true,
    top: 100,
  });

  console.log(`Found ${graphEmails.length} unread messages`);

  if (graphEmails.length === 0) {
    console.log('No unread messages to process');
    return;
  }

  let totalInserted = 0;
  let totalSkipped = 0;
  const processedIds: string[] = [];

  for (const graphEmail of graphEmails) {
    const messageId = graphEmail.internetMessageId || graphEmail.id;

    // Check for duplicates
    const { data: existing } = await supabase
      .from('emails')
      .select('id')
      .eq('external_id', messageId)
      .single();

    if (existing) {
      console.log(`  Skipping duplicate: ${graphEmail.subject}`);
      totalSkipped++;
      processedIds.push(graphEmail.id);
      continue;
    }

    // Extract body text
    let bodyText = '';
    if (graphEmail.body.contentType === 'text') {
      bodyText = graphEmail.body.content;
    } else {
      bodyText = MicrosoftGraph.extractTextFromHtml(graphEmail.body.content);
    }

    // Get recipient email
    const toAddress = graphEmail.toRecipients[0]?.emailAddress?.address || '';

    // Insert into database
    const { data: inserted, error: insertError } = await supabase
      .from('emails')
      .insert({
        client_id: clientId,
        external_id: messageId,
        from_address: graphEmail.from.emailAddress.address,
        to_address: toAddress,
        subject: graphEmail.subject || '(No Subject)',
        body: bodyText,
        status: 'pending',
        created_at: graphEmail.receivedDateTime,
      })
      .select('id')
      .single();

    if (insertError) {
      console.error(`  Failed to insert: ${graphEmail.subject}`, insertError.message);
      continue;
    }

    console.log(`  Inserted: ${graphEmail.subject} (${inserted.id})`);
    totalInserted++;
    processedIds.push(graphEmail.id);

    // Create audit log
    await supabase.from('audit_logs').insert({
      email_id: inserted.id,
      action: 'email_ingested',
      actor: 'graph_api_ingest',
      details: {
        from: graphEmail.from.emailAddress.address,
        subject: graphEmail.subject,
        message_id: messageId,
      },
    });
  }

  console.log(`\nProcessing complete:`);
  console.log(`  Inserted: ${totalInserted}`);
  console.log(`  Skipped (duplicates): ${totalSkipped}`);

  // Mark processed emails as read
  if (processedIds.length > 0) {
    console.log(`\nMarking ${processedIds.length} emails as read...`);
    for (const graphId of processedIds) {
      try {
        await MicrosoftGraph.markAsRead(accessToken, graphId);
      } catch (err) {
        console.error(`Failed to mark email ${graphId} as read:`, err);
      }
    }
    console.log('Emails marked as read');
  }
}

// Main execution
async function main() {
  console.log('=== Email Ingestion ===\n');

  const { clientId, sinceDays: cliSinceDays } = parseCliArgs();

  if (!clientId) {
    console.error('Error: --client <client_id> is required');
    console.error('Usage: pnpm ingest --client <client_id> [--since <days>]');
    process.exit(1);
  }

  console.log(`Client ID: ${clientId}`);

  // Get client credentials
  console.log('Fetching client credentials...');
  const credentials = await getClientCredentials(clientId);
  console.log(`Email: ${credentials.email_address}`);
  console.log(`Provider: ${credentials.email_provider}`);

  // Get sinceDays from CLI or database
  let sinceDays: number;
  if (cliSinceDays !== null) {
    sinceDays = cliSinceDays;
    console.log(`Using --since CLI argument: ${sinceDays} days`);
  } else {
    sinceDays = await getIngestSinceDays(clientId);
    console.log(`Using client_settings ingest_since_days: ${sinceDays} days`);
  }

  // Choose ingestion method based on provider and OAuth availability
  if (credentials.email_provider === 'outlook' && credentials.has_microsoft_oauth) {
    console.log('Using Microsoft Graph API for Outlook...\n');
    await fetchEmailsViaGraph(clientId, sinceDays);
  } else if (credentials.email_provider === 'gmail' && credentials.email_password) {
    console.log('Using IMAP for Gmail...\n');
    const imapCredentials: ImapCredentials = {
      email_address: credentials.email_address,
      email_password: credentials.email_password,
      email_provider: credentials.email_provider,
    };
    await fetchEmails(clientId, imapCredentials, sinceDays);
  } else if (credentials.email_provider === 'outlook' && !credentials.has_microsoft_oauth) {
    throw new Error('Outlook requires OAuth authentication. Please connect your Microsoft account in setup.');
  } else {
    throw new Error(`Unsupported email configuration for provider: ${credentials.email_provider}`);
  }
}

main()
  .then(() => {
    console.log('\nIngestion complete');
    process.exit(0);
  })
  .catch((err) => {
    console.error('\nIngestion failed:', err);
    process.exit(1);
  });
