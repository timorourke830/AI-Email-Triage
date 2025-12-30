import 'dotenv/config';
import { createClient, SupabaseClient } from '@supabase/supabase-js';
import { getLLMClient } from './llm/client.js';
import { sendEmailForClient } from './smtp.js';
import type { Email, Attachment, ClientSettings } from './types/db.js';

const BATCH_SIZE = 5; // Process 5 emails at a time (serverless safe)

interface ProcessResult {
  emailId: string;
  success: boolean;
  error?: string;
}

async function getSupabase(): Promise<SupabaseClient> {
  return createClient(
    process.env.SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_KEY!
  );
}

async function getClientSettings(
  supabase: SupabaseClient,
  clientId: string
): Promise<ClientSettings | null> {
  const timestamp = new Date().toISOString();
  console.log(`[WORKER] ${timestamp} - Fetching client settings for ${clientId}...`);

  const { data, error } = await supabase
    .from('client_settings')
    .select('*')
    .eq('client_id', clientId)
    .single();

  if (error) {
    console.warn(`[WORKER] ${timestamp} - WARNING: Failed to get client settings:`, error.message);
  } else if (data) {
    console.log(`[WORKER] ${timestamp} - Client settings loaded:`, {
      clientId,
      tone: data.reply_tone,
      hasSignature: !!data.signature,
      autoApproveThreshold: data.auto_approve_threshold,
    });
  }

  return data as ClientSettings | null;
}

async function getAttachments(
  supabase: SupabaseClient,
  emailId: string
): Promise<Attachment[]> {
  const { data } = await supabase
    .from('attachments')
    .select('*')
    .eq('email_id', emailId);

  return (data as Attachment[]) || [];
}

async function processEmail(
  supabase: SupabaseClient,
  email: Email
): Promise<ProcessResult> {
  const timestamp = new Date().toISOString();
  console.log(`[WORKER] ${timestamp} - Processing email ${email.id}: "${email.subject?.substring(0, 50)}..."`);
  console.log(`[WORKER] ${timestamp} - Email details:`, {
    id: email.id,
    clientId: email.client_id,
    from: email.from_address,
    subject: email.subject?.substring(0, 50),
  });

  const llm = getLLMClient();

  try {
    // Update status to processing
    console.log(`[WORKER] ${timestamp} - Updating status to 'processing'`);
    await supabase
      .from('emails')
      .update({ status: 'processing', updated_at: new Date().toISOString() })
      .eq('id', email.id);

    await supabase.from('audit_logs').insert({
      email_id: email.id,
      action: 'processing_started',
      actor: 'worker',
    });

    // Step 1: Classify email
    console.log(`[WORKER] ${timestamp} - Step 1: Classifying email ${email.id}...`);
    const { result: classification, error: classError } = await llm.classifyEmail(
      email.from_address,
      email.subject,
      email.body
    );

    if (classError || !classification) {
      console.error(`[WORKER] ${timestamp} - ERROR: Classification failed for ${email.id}:`, classError);
      throw new Error(`Classification failed: ${classError}`);
    }

    console.log(`[WORKER] ${timestamp} - Classification result for ${email.id}:`, {
      classification: classification.classification,
      confidence: classification.confidence,
      reasoning: classification.reasoning?.substring(0, 100) + '...',
    });

    await supabase
      .from('emails')
      .update({
        classification: classification.classification,
        classification_confidence: classification.confidence,
        updated_at: new Date().toISOString(),
      })
      .eq('id', email.id);

    // Step 2: Extract data from email and attachments
    console.log(`[WORKER] ${timestamp} - Step 2: Extracting data from email ${email.id}...`);
    const attachments = await getAttachments(supabase, email.id);
    console.log(`[WORKER] ${timestamp} - Found ${attachments.length} attachments for ${email.id}`);

    const attachmentTexts = attachments
      .filter((a) => a.extracted_text)
      .map((a) => `[${a.filename}]: ${a.extracted_text}`)
      .join('\n\n');

    const { result: extraction, error: extractError } = await llm.extractData(
      `Subject: ${email.subject}\n\n${email.body}`,
      attachmentTexts || undefined
    );

    if (extractError) {
      console.warn(`[WORKER] ${timestamp} - WARNING: Extraction warning for ${email.id}:`, extractError);
    } else {
      console.log(`[WORKER] ${timestamp} - Extraction complete for ${email.id}`);
    }

    if (extraction) {
      await supabase
        .from('emails')
        .update({
          extracted_data: extraction as unknown as Record<string, unknown>,
          updated_at: new Date().toISOString(),
        })
        .eq('id', email.id);
    }

    // Step 3: Draft reply
    console.log(`[WORKER] ${timestamp} - Step 3: Drafting reply for email ${email.id}...`);
    const settings = await getClientSettings(supabase, email.client_id);
    const tone = settings?.reply_tone || 'neutral';
    const signature = settings?.signature || '';

    const { result: draft, error: draftError } = await llm.draftReply({
      from: email.from_address,
      subject: email.subject,
      body: email.body,
      classification: classification.classification,
      extractedData: JSON.stringify(extraction || {}),
      tone,
      signature,
    });

    if (draftError || !draft) {
      console.error(`[WORKER] ${timestamp} - ERROR: Draft failed for ${email.id}:`, draftError);
      throw new Error(`Draft reply failed: ${draftError}`);
    }

    console.log(`[WORKER] ${timestamp} - Draft generated for ${email.id}:`, {
      subject: draft.subject?.substring(0, 50) + '...',
      bodyLength: draft.body.length,
      tone: draft.tone,
    });

    const draftReply = `Subject: ${draft.subject}\n\n${draft.body}\n\n${signature}`;
    const threshold = settings?.auto_approve_threshold || 0;
    const shouldAutoApprove = threshold > 0 && classification.confidence >= threshold;

    console.log(`[WORKER] ${timestamp} - Auto-approve decision for ${email.id}:`, {
      shouldAutoApprove,
      threshold,
      thresholdEnabled: threshold > 0,
      confidence: classification.confidence,
      meetsThreshold: classification.confidence >= threshold,
    });

    if (shouldAutoApprove) {
      // Auto-approve: send email immediately
      console.log(`[WORKER] ${timestamp} - Auto-approving and sending email ${email.id}...`);

      const sendResult = await sendEmailForClient(email.client_id, {
        to: email.from_address,
        subject: draft.subject,
        body: `${draft.body}\n\n${signature}`,
        replyToMessageId: email.external_id || undefined,
        originalSubject: email.subject,
      });

      if (sendResult.success) {
        console.log(`[WORKER] ${timestamp} - Email ${email.id} sent successfully. Message ID: ${sendResult.messageId}`);
        await supabase
          .from('emails')
          .update({
            draft_reply: draftReply,
            final_reply: draftReply,
            status: 'sent',
            processed_at: new Date().toISOString(),
            sent_at: new Date().toISOString(),
            updated_at: new Date().toISOString(),
          })
          .eq('id', email.id);

        await supabase.from('audit_logs').insert({
          email_id: email.id,
          action: 'auto_approved_and_sent',
          actor: 'auto',
          details: {
            classification: classification.classification,
            confidence: classification.confidence,
            threshold,
            message_id: sendResult.messageId,
          },
        });
      } else {
        // Send failed, fall back to awaiting_approval
        console.error(`[WORKER] ${timestamp} - ERROR: Auto-send failed for email ${email.id}:`, sendResult.error);
        await supabase
          .from('emails')
          .update({
            draft_reply: draftReply,
            status: 'awaiting_approval',
            processed_at: new Date().toISOString(),
            updated_at: new Date().toISOString(),
          })
          .eq('id', email.id);

        await supabase.from('audit_logs').insert({
          email_id: email.id,
          action: 'auto_send_failed',
          actor: 'auto',
          details: {
            classification: classification.classification,
            confidence: classification.confidence,
            threshold,
            error: sendResult.error,
          },
        });
      }
    } else {
      // Manual approval required
      console.log(`[WORKER] ${timestamp} - Email ${email.id} requires manual approval. Updating status to 'awaiting_approval'`);
      await supabase
        .from('emails')
        .update({
          draft_reply: draftReply,
          status: 'awaiting_approval',
          processed_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
        })
        .eq('id', email.id);

      await supabase.from('audit_logs').insert({
        email_id: email.id,
        action: 'processing_completed',
        actor: 'worker',
        details: {
          classification: classification.classification,
          confidence: classification.confidence,
          below_threshold: threshold > 0 ? threshold : undefined,
        },
      });
    }

    console.log(`[WORKER] ${timestamp} - Email ${email.id} processing complete`);
    return { emailId: email.id, success: true };
  } catch (err) {
    const errorMessage = err instanceof Error ? err.message : 'Unknown error';
    console.error(`[WORKER] ${timestamp} - ERROR: Exception processing email ${email.id}:`, {
      error: errorMessage,
      stack: err instanceof Error ? err.stack : undefined,
    });

    // Revert to pending on failure for retry
    console.log(`[WORKER] ${timestamp} - Reverting email ${email.id} to 'pending' status`);
    await supabase
      .from('emails')
      .update({
        status: 'pending',
        updated_at: new Date().toISOString(),
      })
      .eq('id', email.id);

    await supabase.from('audit_logs').insert({
      email_id: email.id,
      action: 'processing_failed',
      actor: 'worker',
      details: { error: errorMessage },
    });

    return { emailId: email.id, success: false, error: errorMessage };
  }
}

export async function runWorker(): Promise<{
  processed: number;
  succeeded: number;
  failed: number;
  results: ProcessResult[];
}> {
  const timestamp = new Date().toISOString();
  console.log(`[WORKER] ${timestamp} - Worker started`);
  console.log(`[WORKER] ${timestamp} - Batch size: ${BATCH_SIZE}`);

  const supabase = await getSupabase();
  console.log(`[WORKER] ${timestamp} - Supabase client initialized`);

  // Fetch pending emails (limited batch for serverless)
  console.log(`[WORKER] ${timestamp} - Fetching pending emails...`);
  const { data: emails, error } = await supabase
    .from('emails')
    .select('*')
    .eq('status', 'pending')
    .order('created_at', { ascending: true })
    .limit(BATCH_SIZE);

  if (error) {
    console.error(`[WORKER] ${timestamp} - ERROR: Failed to fetch pending emails:`, error.message);
    throw new Error(`Failed to fetch pending emails: ${error.message}`);
  }

  if (!emails || emails.length === 0) {
    console.log(`[WORKER] ${timestamp} - No pending emails found`);
    return { processed: 0, succeeded: 0, failed: 0, results: [] };
  }

  console.log(`[WORKER] ${timestamp} - Found ${emails.length} pending emails to process`);

  // Process emails sequentially to avoid rate limits
  console.log(`[WORKER] ${timestamp} - Starting email processing loop...`);
  const results: ProcessResult[] = [];
  for (const email of emails as Email[]) {
    const result = await processEmail(supabase, email);
    results.push(result);
  }

  const succeeded = results.filter((r) => r.success).length;
  const failed = results.filter((r) => !r.success).length;

  console.log(`[WORKER] ${timestamp} - Worker complete:`, {
    processed: results.length,
    succeeded,
    failed,
  });

  return {
    processed: results.length,
    succeeded,
    failed,
    results,
  };
}

// Run directly if executed as script
if (process.argv[1]?.endsWith('worker.ts') || process.argv[1]?.endsWith('worker.js')) {
  runWorker()
    .then((result) => {
      console.log('Worker completed:', result);
      process.exit(0);
    })
    .catch((err) => {
      console.error('Worker failed:', err);
      process.exit(1);
    });
}
