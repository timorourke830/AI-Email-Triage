import type { NextApiResponse } from 'next';
import { withAuth, AuthenticatedRequest } from '@/lib/auth';
import { getSupabaseServiceClient } from '@/lib/supabase';
import { sendEmail, parseReplyContent } from '@/lib/smtp';
import type { Email } from '@/lib/types';

async function handler(req: AuthenticatedRequest, res: NextApiResponse) {
  if (req.method !== 'POST') {
    res.setHeader('Allow', ['POST']);
    res.status(405).json({ error: 'Method not allowed' });
    return;
  }

  const { id } = req.query;
  const { edited_reply } = req.body as { edited_reply?: string };

  if (!id || typeof id !== 'string') {
    res.status(400).json({ error: 'Invalid email ID' });
    return;
  }

  try {
    const supabase = getSupabaseServiceClient();

    // Get current email - must belong to authenticated user's client
    const { data: email, error: fetchError } = await supabase
      .from('emails')
      .select('*')
      .eq('id', id)
      .eq('client_id', req.clientId)
      .single();

    if (fetchError || !email) {
      res.status(404).json({ error: 'Email not found' });
      return;
    }

    const typedEmail = email as Email;

    if (typedEmail.status !== 'awaiting_approval') {
      res.status(400).json({
        error: `Cannot approve email with status: ${typedEmail.status}`,
      });
      return;
    }

    const finalReply = edited_reply || typedEmail.draft_reply;

    if (!finalReply) {
      res.status(400).json({ error: 'No reply content to send' });
      return;
    }

    // Parse the reply content to extract subject and body
    const { subject, body } = parseReplyContent(finalReply);

    // Send the email via SMTP
    const sendResult = await sendEmail({
      to: typedEmail.from_address,
      subject: subject || `Re: ${typedEmail.subject}`,
      body: body,
      replyToMessageId: typedEmail.external_id || undefined,
      originalSubject: typedEmail.subject,
    }, req.clientId);

    if (!sendResult.success) {
      // Log the failure but don't update status
      await supabase.from('audit_logs').insert({
        email_id: id,
        action: 'send_failed',
        actor: 'smtp',
        details: { error: sendResult.error },
      });

      res.status(500).json({
        error: `Failed to send email: ${sendResult.error}`,
      });
      return;
    }

    // Update email with sent status
    const { error: updateError } = await supabase
      .from('emails')
      .update({
        status: 'sent',
        final_reply: finalReply,
        sent_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      })
      .eq('id', id);

    if (updateError) {
      res.status(500).json({ error: updateError.message });
      return;
    }

    // Audit log for successful send
    await supabase.from('audit_logs').insert({
      email_id: id,
      action: 'approved_and_sent',
      actor: 'user',
      details: {
        edited: !!edited_reply,
        smtp_message_id: sendResult.messageId,
        sent_to: typedEmail.from_address,
      },
    });

    res.status(200).json({
      success: true,
      status: 'sent',
      messageId: sendResult.messageId,
    });
  } catch (err) {
    console.error('API error:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
}

export default withAuth(handler);
