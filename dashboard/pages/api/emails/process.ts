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
  if (req.method !== 'POST') {
    res.setHeader('Allow', ['POST']);
    res.status(405).json({
      success: false,
      processed: 0,
      errors: 0,
    });
    return;
  }

  const { clientId } = req;
  const { limit = 10, emailId } = req.body || {};

  const supabase = getSupabaseServiceClient();

  // If specific emailId provided, first check if the email exists and its current status
  if (emailId) {
    const { data: emailCheck, error: checkError } = await supabase
      .from('emails')
      .select('id, status, client_id')
      .eq('id', emailId)
      .single();

    if (checkError || !emailCheck) {
      console.error('[PROCESS-API] Email not found:', emailId);
      res.status(404).json({
        success: false,
        processed: 0,
        errors: 1,
        details: [{ email_id: emailId, classification: null, status: 'error', error: 'Email not found' }],
      });
      return;
    }

    if (emailCheck.client_id !== clientId) {
      console.error('[PROCESS-API] Unauthorized access attempt:', { emailId, clientId });
      res.status(403).json({
        success: false,
        processed: 0,
        errors: 1,
        details: [{ email_id: emailId, classification: null, status: 'error', error: 'Access denied' }],
      });
      return;
    }

    if (emailCheck.status !== 'pending') {
      res.status(400).json({
        success: false,
        processed: 0,
        errors: 1,
        details: [{ email_id: emailId, classification: null, status: 'error', error: `Email status is '${emailCheck.status}', expected 'pending'` }],
      });
      return;
    }
  }

  // Get pending emails - either specific email or batch
  let query = supabase
    .from('emails')
    .select('id, from_address, subject, body')
    .eq('client_id', clientId)
    .eq('status', 'pending');

  if (emailId) {
    query = query.eq('id', emailId);
  } else {
    query = query.order('created_at', { ascending: true }).limit(Math.min(limit, 50));
  }

  const { data: emails, error: fetchError } = await query as { data: EmailRow[] | null; error: unknown };

  if (fetchError) {
    console.error('[PROCESS-API] Failed to fetch emails:', fetchError);
    res.status(500).json({
      success: false,
      processed: 0,
      errors: 0,
    });
    return;
  }

  if (!emails || emails.length === 0) {
    res.status(200).json({
      success: true,
      processed: 0,
      errors: 0,
      details: [],
    });
    return;
  }

  // Get client settings
  const { data: settings } = await supabase
    .from('client_settings')
    .select('reply_tone, signature, auto_approve_threshold')
    .eq('client_id', clientId)
    .single() as { data: ClientSettings | null; error: unknown };

  const tone = settings?.reply_tone || 'neutral';
  const signature = settings?.signature || '';
  // Use ?? instead of || because 0 is a valid value meaning "never auto-approve"
  const autoApproveThreshold = settings?.auto_approve_threshold ?? 0;

  const llm = getLLMClient();
  const details: ProcessResponse['details'] = [];
  let processed = 0;
  let errors = 0;

  for (const email of emails) {
    try {
      // Mark as processing
      const { error: markProcessingError } = await supabase
        .from('emails')
        .update({ status: 'processing' })
        .eq('id', email.id);

      if (markProcessingError) {
        throw new Error(`Failed to update status: ${markProcessingError.message}`);
      }

      // Classify the email
      const { result: classification, error: classifyError } = await llm.classifyEmail(
        email.from_address,
        email.subject,
        email.body
      );

      if (classifyError || !classification) {
        console.error('[PROCESS-API] Classification failed:', email.id, classifyError);
        errors++;
        details?.push({
          email_id: email.id,
          classification: null,
          status: 'error',
          error: 'Failed to classify email',
        });

        await supabase
          .from('emails')
          .update({ status: 'pending' })
          .eq('id', email.id);
        continue;
      }

      // Handle spam - mark as rejected
      if (classification.classification === 'spam') {
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
        continue;
      }

      // Draft a reply for non-spam emails
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
        console.error('[PROCESS-API] Draft failed:', email.id, draftError);
        errors++;
        details?.push({
          email_id: email.id,
          classification: classification.classification,
          status: 'error',
          error: 'Failed to generate reply',
        });

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

      // Combine draft body with signature
      const fullReply = signature
        ? `Subject: ${draft.subject}\n\n${draft.body}\n\n${signature}`
        : `Subject: ${draft.subject}\n\n${draft.body}`;

      // Check if we should auto-approve based on confidence
      const shouldAutoApprove =
        autoApproveThreshold > 0 &&
        classification.confidence >= autoApproveThreshold &&
        classification.classification !== 'complaint';

      const newStatus = shouldAutoApprove ? 'sent' : 'awaiting_approval';

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
        throw new Error(`Failed to save processing results: ${updateError.message}`);
      }

      await supabase.from('audit_logs').insert({
        email_id: email.id,
        action: shouldAutoApprove ? 'auto_approved' : 'draft_created',
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
    } catch (err) {
      console.error('[PROCESS-API] Error processing email:', email.id, err);
      errors++;
      details?.push({
        email_id: email.id,
        classification: null,
        status: 'error',
        error: 'An error occurred while processing',
      });

      await supabase
        .from('emails')
        .update({ status: 'pending' })
        .eq('id', email.id);
    }
  }

  res.status(200).json({
    success: errors === 0,
    processed,
    errors,
    details,
  });
}

export default withAuth(handler);
