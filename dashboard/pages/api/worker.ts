import type { NextApiRequest, NextApiResponse } from 'next';
import { getSupabaseClient } from '@/lib/supabase';
import { getLLMClient } from '@/lib/llm/client';
import type { Email, Attachment } from '@/lib/types';

const BATCH_SIZE = 5;

interface ClientSettings {
  reply_tone: 'formal' | 'friendly' | 'neutral';
  signature: string;
}

interface ProcessResult {
  emailId: string;
  success: boolean;
  error?: string;
}

async function getClientSettings(
  supabase: ReturnType<typeof getSupabaseClient>,
  clientId: string
): Promise<ClientSettings | null> {
  const { data } = await supabase
    .from('client_settings')
    .select('*')
    .eq('client_id', clientId)
    .single();

  return data as ClientSettings | null;
}

async function getAttachments(
  supabase: ReturnType<typeof getSupabaseClient>,
  emailId: string
): Promise<Attachment[]> {
  const { data } = await supabase
    .from('attachments')
    .select('*')
    .eq('email_id', emailId);

  return (data as Attachment[]) || [];
}

async function processEmail(
  supabase: ReturnType<typeof getSupabaseClient>,
  email: Email
): Promise<ProcessResult> {
  const llm = getLLMClient();

  try {
    // Update status to processing
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
    const { result: classification, error: classError } = await llm.classifyEmail(
      email.from_address,
      email.subject,
      email.body
    );

    if (classError || !classification) {
      throw new Error(`Classification failed: ${classError}`);
    }

    await supabase
      .from('emails')
      .update({
        classification: classification.classification,
        classification_confidence: classification.confidence,
        updated_at: new Date().toISOString(),
      })
      .eq('id', email.id);

    // Step 2: Extract data from email and attachments
    const attachments = await getAttachments(supabase, email.id);
    const attachmentTexts = attachments
      .filter((a) => a.extracted_text)
      .map((a) => `[${a.filename}]: ${a.extracted_text}`)
      .join('\n\n');

    const { result: extraction, error: extractError } = await llm.extractData(
      `Subject: ${email.subject}\n\n${email.body}`,
      attachmentTexts || undefined
    );

    if (extractError) {
      console.warn(`Extraction warning for ${email.id}: ${extractError}`);
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
      throw new Error(`Draft reply failed: ${draftError}`);
    }

    // Update email with draft and move to awaiting_approval
    await supabase
      .from('emails')
      .update({
        draft_reply: `Subject: ${draft.subject}\n\n${draft.body}\n\n${signature}`,
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
      },
    });

    return { emailId: email.id, success: true };
  } catch (err) {
    const errorMessage = err instanceof Error ? err.message : 'Unknown error';

    // Revert to pending on failure for retry
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

export default async function handler(
  req: NextApiRequest,
  res: NextApiResponse
) {
  // Verify cron secret for security
  const authHeader = req.headers.authorization;
  if (authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    res.status(401).json({ error: 'Unauthorized' });
    return;
  }

  try {
    const supabase = getSupabaseClient();

    // Fetch pending emails (limited batch for serverless)
    const { data: emails, error } = await supabase
      .from('emails')
      .select('*')
      .eq('status', 'pending')
      .order('created_at', { ascending: true })
      .limit(BATCH_SIZE);

    if (error) {
      throw new Error(`Failed to fetch pending emails: ${error.message}`);
    }

    if (!emails || emails.length === 0) {
      res.status(200).json({ processed: 0, succeeded: 0, failed: 0, results: [] });
      return;
    }

    // Process emails sequentially to avoid rate limits
    const results: ProcessResult[] = [];
    for (const email of emails as Email[]) {
      const result = await processEmail(supabase, email);
      results.push(result);
    }

    const succeeded = results.filter((r) => r.success).length;
    const failed = results.filter((r) => !r.success).length;

    res.status(200).json({
      processed: results.length,
      succeeded,
      failed,
      results,
    });
  } catch (err) {
    console.error('Worker error:', err);
    res.status(500).json({ error: 'Worker failed' });
  }
}
