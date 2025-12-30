import { createClient } from '@supabase/supabase-js';
import type { Email } from './types/db.js';

/**
 * Email Ingestion Stub
 *
 * This module provides a stub for email ingestion. In production, you would:
 * 1. Connect to an email provider (Gmail API, Microsoft Graph, IMAP, etc.)
 * 2. Set up webhooks or polling to receive new emails
 * 3. Parse email content and attachments
 * 4. Store in Supabase
 *
 * For now, this provides utility functions to manually ingest emails.
 */

interface IngestEmailParams {
  clientId: string;
  externalId?: string;
  from: string;
  to: string;
  subject: string;
  body: string;
  attachments?: Array<{
    filename: string;
    contentType: string;
    content: Buffer;
  }>;
}

export async function ingestEmail(params: IngestEmailParams): Promise<Email> {
  const supabase = createClient(
    process.env.SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_KEY!
  );

  // Insert email
  const { data: email, error: emailError } = await supabase
    .from('emails')
    .insert({
      client_id: params.clientId,
      external_id: params.externalId || null,
      from_address: params.from,
      to_address: params.to,
      subject: params.subject,
      body: params.body,
      status: 'pending',
    })
    .select()
    .single();

  if (emailError || !email) {
    throw new Error(`Failed to insert email: ${emailError?.message}`);
  }

  // Upload attachments if any
  if (params.attachments && params.attachments.length > 0) {
    for (const attachment of params.attachments) {
      const storagePath = `${email.id}/${attachment.filename}`;

      // Upload to Supabase Storage
      const { error: uploadError } = await supabase.storage
        .from('attachments')
        .upload(storagePath, attachment.content, {
          contentType: attachment.contentType,
        });

      if (uploadError) {
        console.error(`Failed to upload attachment: ${uploadError.message}`);
        continue;
      }

      // Insert attachment record
      await supabase.from('attachments').insert({
        email_id: email.id,
        filename: attachment.filename,
        content_type: attachment.contentType,
        storage_path: storagePath,
      });
    }
  }

  // Create audit log
  await supabase.from('audit_logs').insert({
    email_id: email.id,
    action: 'email_ingested',
    actor: 'system',
    details: {
      from: params.from,
      subject: params.subject,
      attachment_count: params.attachments?.length || 0,
    },
  });

  return email as Email;
}

/**
 * Webhook handler stub for email providers
 * In production, implement specific handlers for:
 * - Gmail Push Notifications
 * - Microsoft Graph Webhooks
 * - SendGrid Inbound Parse
 * - etc.
 */
export async function handleEmailWebhook(
  provider: string,
  payload: unknown
): Promise<{ success: boolean; emailId?: string; error?: string }> {
  console.log(`Received webhook from ${provider}:`, payload);

  // TODO: Implement provider-specific parsing
  // For now, return a stub response
  return {
    success: false,
    error: 'Webhook handling not implemented. Use ingestEmail() directly.',
  };
}
