/**
 * API endpoint to process pending emails
 * POST /api/emails/process
 *
 * Processes pending emails by:
 * 1. Classifying them using LLM
 * 2. Drafting replies for non-spam emails
 * 3. Updating status to 'awaiting_approval'
 */

import type { NextApiResponse } from 'next';
import { withAuth, AuthenticatedRequest } from '../../../lib/auth';
import { getSupabaseServiceClient } from '../../../lib/supabase';
import { getLLMClient, ClassificationResult, DraftReplyResult } from '../../../lib/llm';

interface ProcessResponse {
  success: boolean;
  processed: number;
  errors: number;
  details?: Array<{
    email_id: string;
    classification: string | null;
    status: string;
    error?: string;
  }>;
}

interface EmailRow {
  id: string;
  from_address: string;
  subject: string;
  body: string;
}

interface ClientSettings {
  reply_tone: string | null;
  signature: string | null;
  auto_approve_threshold: number | null;
}

async function handler(
  req: AuthenticatedRequest,
  res: NextApiResponse<ProcessResponse>
): Promise<void> {
  const timestamp = new Date().toISOString();

  console.log(`[PROCESS-API] ${timestamp} - Request received: ${req.method} /api/emails/process`);

  if (req.method !== 'POST') {
    console.log(`[PROCESS-API] ${timestamp} - ERROR: Method not allowed: ${req.method}`);
    res.setHeader('Allow', ['POST']);
    res.status(405).json({
      success: false,
      processed: 0,
      errors: 0,
    });
    return;
  }

  const { clientId, userId, userEmail } = req;
  const { limit = 10 } = req.body || {};

  console.log(`[PROCESS-API] ${timestamp} - Authentication verified:`, {
    userId,
    clientId,
    userEmail,
  });
  console.log(`[PROCESS-API] ${timestamp} - Request parameters: limit=${limit}`);

  const supabase = getSupabaseServiceClient();

  // Get pending emails
  console.log(`[PROCESS-API] ${timestamp} - Fetching pending emails for client ${clientId}...`);
  const { data: emails, error: fetchError } = await supabase
    .from('emails')
    .select('id, from_address, subject, body')
    .eq('client_id', clientId)
    .eq('status', 'pending')
    .order('created_at', { ascending: true })
    .limit(Math.min(limit, 50)) as { data: EmailRow[] | null; error: unknown };

  if (fetchError) {
    console.error(`[PROCESS-API] ${timestamp} - ERROR: Failed to fetch pending emails:`, fetchError);
    res.status(500).json({
      success: false,
      processed: 0,
      errors: 0,
    });
    return;
  }

  if (!emails || emails.length === 0) {
    console.log(`[PROCESS-API] ${timestamp} - No pending emails found for client ${clientId}`);
    res.status(200).json({
      success: true,
      processed: 0,
      errors: 0,
      details: [],
    });
    return;
  }

  console.log(`[PROCESS-API] ${timestamp} - Found ${emails.length} pending emails to process`);

  // Get client settings
  console.log(`[PROCESS-API] ${timestamp} - Fetching client settings for ${clientId}...`);
  const { data: settings, error: settingsError } = await supabase
    .from('client_settings')
    .select('reply_tone, signature, auto_approve_threshold')
    .eq('client_id', clientId)
    .single() as { data: ClientSettings | null; error: unknown };

  if (settingsError) {
    console.warn(`[PROCESS-API] ${timestamp} - WARNING: Failed to fetch client settings:`, settingsError);
  }

  const tone = settings?.reply_tone || 'neutral';
  const signature = settings?.signature || '';
  // IMPORTANT: Use ?? instead of || because 0 is a valid value meaning "never auto-approve"
  // When threshold is 0, no email should be auto-approved (confidence can never exceed 0)
  const autoApproveThreshold = settings?.auto_approve_threshold ?? 0;

  console.log(`[PROCESS-API] ${timestamp} - Client settings loaded:`, {
    tone,
    hasSignature: !!signature,
    signatureLength: signature.length,
    autoApproveThreshold,
    autoApproveEnabled: autoApproveThreshold > 0,
  });

  const llm = getLLMClient();
  const details: ProcessResponse['details'] = [];
  let processed = 0;
  let errors = 0;

  console.log(`[PROCESS-API] ${timestamp} - Starting email processing loop...`);

  for (const email of emails) {
    const emailTimestamp = new Date().toISOString();
    console.log(`[PROCESS-API] ${emailTimestamp} - Processing email ${email.id}: "${email.subject?.substring(0, 50)}..."`);

    try {
      // Mark as processing
      const { error: markProcessingError } = await supabase
        .from('emails')
        .update({ status: 'processing' })
        .eq('id', email.id);

      if (markProcessingError) {
        console.error(`[PROCESS-API] ${emailTimestamp} - ERROR: Failed to mark email as processing:`, markProcessingError);
        throw new Error(`Failed to update status: ${markProcessingError.message}`);
      }

      // Classify the email
      console.log(`[PROCESS-API] ${emailTimestamp} - Classifying email ${email.id}...`);
      const { result: classification, error: classifyError } = await llm.classifyEmail(
        email.from_address,
        email.subject,
        email.body
      );

      if (classifyError || !classification) {
        console.error(`[PROCESS-API] ${emailTimestamp} - ERROR: Classification failed for email ${email.id}:`, classifyError);
        errors++;
        details?.push({
          email_id: email.id,
          classification: null,
          status: 'error',
          error: classifyError || 'Classification failed',
        });

        // Reset to pending on error
        await supabase
          .from('emails')
          .update({ status: 'pending' })
          .eq('id', email.id);
        continue;
      }

      console.log(`[PROCESS-API] ${emailTimestamp} - Classification result for ${email.id}:`, {
        classification: classification.classification,
        confidence: classification.confidence,
        reasoning: classification.reasoning?.substring(0, 100) + '...',
      });

      // Handle spam - mark as rejected
      if (classification.classification === 'spam') {
        console.log(`[PROCESS-API] ${emailTimestamp} - Email ${email.id} classified as spam, auto-rejecting`);
        await supabase
          .from('emails')
          .update({
            status: 'rejected',
            classification: classification.classification,
            classification_confidence: classification.confidence,
            extracted_data: { reasoning: classification.reasoning },
            processed_at: new Date().toISOString(),
          })
          .eq('id', email.id);

        await supabase.from('audit_logs').insert({
          email_id: email.id,
          action: 'auto_rejected_spam',
          actor: 'system',
          details: { classification },
        });

        processed++;
        details?.push({
          email_id: email.id,
          classification: 'spam',
          status: 'rejected',
        });
        console.log(`[PROCESS-API] ${emailTimestamp} - Email ${email.id} spam rejection complete`);
        continue;
      }

      // Draft a reply for non-spam emails
      console.log(`[PROCESS-API] ${emailTimestamp} - Drafting reply for email ${email.id}...`);
      const { result: draft, error: draftError } = await llm.draftReply({
        from: email.from_address,
        subject: email.subject,
        body: email.body,
        classification: classification.classification,
        extractedData: classification.reasoning,
        tone,
        signature,
      });

      if (draftError || !draft) {
        console.error(`[PROCESS-API] ${emailTimestamp} - ERROR: Draft failed for email ${email.id}:`, draftError);
        errors++;
        details?.push({
          email_id: email.id,
          classification: classification.classification,
          status: 'error',
          error: draftError || 'Draft failed',
        });

        // Still save the classification
        await supabase
          .from('emails')
          .update({
            status: 'pending',
            classification: classification.classification,
            classification_confidence: classification.confidence,
          })
          .eq('id', email.id);
        continue;
      }

      console.log(`[PROCESS-API] ${emailTimestamp} - Draft generated for ${email.id}:`, {
        subject: draft.subject?.substring(0, 50) + '...',
        bodyLength: draft.body.length,
        tone: draft.tone,
      });

      // Combine draft body with signature
      const fullReply = signature
        ? `Subject: ${draft.subject}\n\n${draft.body}\n\n${signature}`
        : `Subject: ${draft.subject}\n\n${draft.body}`;

      // Check if we should auto-approve based on confidence
      // - If threshold is 0, NEVER auto-approve (user chose "require approval for all")
      // - If threshold > 0, auto-approve when confidence exceeds threshold
      // - Never auto-approve complaints regardless of confidence
      const shouldAutoApprove =
        autoApproveThreshold > 0 &&
        classification.confidence >= autoApproveThreshold &&
        classification.classification !== 'complaint';

      console.log(`[PROCESS-API] ${emailTimestamp} - Auto-approve decision for ${email.id}:`, {
        shouldAutoApprove,
        autoApproveThreshold,
        thresholdEnabled: autoApproveThreshold > 0,
        confidence: classification.confidence,
        meetsThreshold: classification.confidence >= autoApproveThreshold,
        isComplaint: classification.classification === 'complaint',
        classification: classification.classification,
      });

      // Update email with classification and draft
      const newStatus = shouldAutoApprove ? 'sent' : 'awaiting_approval';
      console.log(`[PROCESS-API] ${emailTimestamp} - Updating email ${email.id} status to: ${newStatus}`);

      const { error: updateError } = await supabase
        .from('emails')
        .update({
          status: newStatus,
          classification: classification.classification,
          classification_confidence: classification.confidence,
          extracted_data: {
            reasoning: classification.reasoning,
            suggested_actions: draft.suggested_actions,
          },
          draft_reply: fullReply,
          final_reply: shouldAutoApprove ? fullReply : null,
          processed_at: new Date().toISOString(),
          sent_at: shouldAutoApprove ? new Date().toISOString() : null,
        })
        .eq('id', email.id);

      if (updateError) {
        console.error(`[PROCESS-API] ${emailTimestamp} - ERROR: Failed to update email ${email.id}:`, updateError);
        throw new Error(`Failed to save processing results: ${updateError.message}`);
      }

      console.log(`[PROCESS-API] ${emailTimestamp} - Successfully updated email ${email.id} in database`);

      // Create audit log
      const auditAction = shouldAutoApprove ? 'auto_approved' : 'draft_created';
      console.log(`[PROCESS-API] ${emailTimestamp} - Creating audit log: ${auditAction} for email ${email.id}`);

      await supabase.from('audit_logs').insert({
        email_id: email.id,
        action: auditAction,
        actor: 'system',
        details: {
          classification,
          draft_tone: draft.tone,
          auto_approved: shouldAutoApprove,
        },
      });

      processed++;
      details?.push({
        email_id: email.id,
        classification: classification.classification,
        status: newStatus,
      });

      console.log(`[PROCESS-API] ${emailTimestamp} - Email ${email.id} processing complete: ${newStatus}`);
    } catch (err) {
      const errorMsg = err instanceof Error ? err.message : 'Unknown error';
      console.error(`[PROCESS-API] ${emailTimestamp} - ERROR: Exception processing email ${email.id}:`, {
        error: errorMsg,
        stack: err instanceof Error ? err.stack : undefined,
      });

      errors++;
      details?.push({
        email_id: email.id,
        classification: null,
        status: 'error',
        error: errorMsg,
      });

      // Reset to pending on error
      await supabase
        .from('emails')
        .update({ status: 'pending' })
        .eq('id', email.id);
    }
  }

  console.log(`[PROCESS-API] ${timestamp} - Processing loop complete:`, {
    total: emails.length,
    processed,
    errors,
  });

  console.log(`[PROCESS-API] ${timestamp} - Request complete. Returning response.`);
  res.status(200).json({
    success: errors === 0,
    processed,
    errors,
    details,
  });
}

export default withAuth(handler);
