import 'dotenv/config';
import express, { Request, Response, NextFunction } from 'express';
import cors from 'cors';
import { createClient } from '@supabase/supabase-js';
import type { Email } from './types/db.js';
import { ingestEmail } from './email_ingestion.js';
import { getLLMClient } from './llm/client.js';
import { sendEmailForClient, parseReplyContent } from './smtp.js';

const app = express();
const PORT = process.env.PORT || 3001;

// Middleware
app.use(cors());
app.use(express.json());

// Supabase client
function getSupabase() {
  return createClient(
    process.env.SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_KEY!
  );
}

// Error handler
function asyncHandler(
  fn: (req: Request, res: Response) => Promise<void>
): (req: Request, res: Response, next: NextFunction) => void {
  return (req, res, next) => {
    fn(req, res).catch(next);
  };
}

// Routes

// Health check
app.get('/api/health', (_, res) => {
  res.json({ status: 'ok', timestamp: new Date().toISOString() });
});

// POST /api/ingest - Ingest a new email
app.post(
  '/api/ingest',
  asyncHandler(async (req, res) => {
    const { client_id, external_id, from, to, subject, body } = req.body as {
      client_id: string;
      external_id?: string;
      from: string;
      to: string;
      subject: string;
      body: string;
    };

    // Validate required fields
    if (!client_id || !from || !to || !subject || !body) {
      res.status(400).json({
        error: 'Missing required fields: client_id, from, to, subject, body',
      });
      return;
    }

    try {
      const email = await ingestEmail({
        clientId: client_id,
        externalId: external_id,
        from,
        to,
        subject,
        body,
      });

      res.status(201).json({ success: true, email });
    } catch (err) {
      res.status(500).json({
        error: err instanceof Error ? err.message : 'Failed to ingest email',
      });
    }
  })
);

// POST /api/search - Search emails by query string
app.post(
  '/api/search',
  asyncHandler(async (req, res) => {
    const supabase = getSupabase();
    const { query, client_id, status, limit = 20 } = req.body as {
      query: string;
      client_id?: string;
      status?: string;
      limit?: number;
    };

    if (!query || query.trim().length === 0) {
      res.status(400).json({ error: 'Search query is required' });
      return;
    }

    const searchTerm = `%${query.trim()}%`;
    const limitNum = Math.min(limit, 100);

    // Build query with ilike for case-insensitive search
    let dbQuery = supabase
      .from('emails')
      .select('*')
      .or(`subject.ilike.${searchTerm},body.ilike.${searchTerm},from_address.ilike.${searchTerm}`)
      .order('created_at', { ascending: false })
      .limit(limitNum);

    if (client_id) {
      dbQuery = dbQuery.eq('client_id', client_id);
    }
    if (status) {
      dbQuery = dbQuery.eq('status', status);
    }

    const { data, error } = await dbQuery;

    if (error) {
      res.status(500).json({ error: error.message });
      return;
    }

    res.json({
      query,
      count: data?.length || 0,
      emails: data || [],
    });
  })
);

// POST /api/rank - Rank emails by priority using LLM
app.post(
  '/api/rank',
  asyncHandler(async (req, res) => {
    const supabase = getSupabase();
    const { email_ids } = req.body as { email_ids: string[] };

    if (!email_ids || !Array.isArray(email_ids) || email_ids.length === 0) {
      res.status(400).json({ error: 'email_ids array is required' });
      return;
    }

    if (email_ids.length > 20) {
      res.status(400).json({ error: 'Maximum 20 emails can be ranked at once' });
      return;
    }

    // Fetch the emails
    const { data: emails, error: fetchError } = await supabase
      .from('emails')
      .select('id, from_address, subject, body')
      .in('id', email_ids);

    if (fetchError) {
      res.status(500).json({ error: fetchError.message });
      return;
    }

    if (!emails || emails.length === 0) {
      res.status(404).json({ error: 'No emails found with the provided IDs' });
      return;
    }

    // Use LLM to rank emails
    const llm = getLLMClient();
    const { result, error: rankError } = await llm.rankEmails(
      emails.map((e) => ({
        id: e.id,
        from: e.from_address,
        subject: e.subject,
        body: e.body,
      }))
    );

    if (rankError || !result) {
      res.status(500).json({
        error: rankError || 'Failed to rank emails',
      });
      return;
    }

    res.json({
      ranked_ids: result.ranked_ids,
      rankings: result.rankings,
    });
  })
);

// List emails with pagination and filters
app.get(
  '/api/emails',
  asyncHandler(async (req, res) => {
    const supabase = getSupabase();
    const {
      status,
      client_id,
      page = '1',
      limit = '20',
    } = req.query as Record<string, string>;

    const pageNum = parseInt(page, 10);
    const limitNum = Math.min(parseInt(limit, 10), 100);
    const offset = (pageNum - 1) * limitNum;

    let query = supabase
      .from('emails')
      .select('*', { count: 'exact' })
      .order('created_at', { ascending: false })
      .range(offset, offset + limitNum - 1);

    if (status) {
      query = query.eq('status', status);
    }
    if (client_id) {
      query = query.eq('client_id', client_id);
    }

    const { data, count, error } = await query;

    if (error) {
      res.status(500).json({ error: error.message });
      return;
    }

    res.json({
      emails: data,
      pagination: {
        page: pageNum,
        limit: limitNum,
        total: count || 0,
        pages: Math.ceil((count || 0) / limitNum),
      },
    });
  })
);

// Get single email with attachments and audit logs
app.get(
  '/api/emails/:id',
  asyncHandler(async (req, res) => {
    const supabase = getSupabase();
    const { id } = req.params;

    const [emailResult, attachmentsResult, logsResult] = await Promise.all([
      supabase.from('emails').select('*').eq('id', id).single(),
      supabase.from('attachments').select('*').eq('email_id', id),
      supabase
        .from('audit_logs')
        .select('*')
        .eq('email_id', id)
        .order('created_at', { ascending: true }),
    ]);

    if (emailResult.error) {
      res.status(404).json({ error: 'Email not found' });
      return;
    }

    res.json({
      email: emailResult.data,
      attachments: attachmentsResult.data || [],
      audit_logs: logsResult.data || [],
    });
  })
);

// Approve email reply
app.post(
  '/api/emails/:id/approve',
  asyncHandler(async (req, res) => {
    const supabase = getSupabase();
    const { id } = req.params;
    const { edited_reply } = req.body as { edited_reply?: string };

    // Get current email
    const { data: email, error: fetchError } = await supabase
      .from('emails')
      .select('*')
      .eq('id', id)
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

    // Send the email
    const sendResult = await sendEmailForClient(typedEmail.client_id, {
      to: typedEmail.from_address,
      subject: subject || `Re: ${typedEmail.subject}`,
      body: body,
      replyToMessageId: typedEmail.external_id || undefined,
      originalSubject: typedEmail.subject,
    });

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

    res.json({
      success: true,
      status: 'sent',
      messageId: sendResult.messageId,
    });
  })
);

// Reject email reply
app.post(
  '/api/emails/:id/reject',
  asyncHandler(async (req, res) => {
    const supabase = getSupabase();
    const { id } = req.params;
    const { reason } = req.body as { reason?: string };

    // Get current email
    const { data: email, error: fetchError } = await supabase
      .from('emails')
      .select('*')
      .eq('id', id)
      .single();

    if (fetchError || !email) {
      res.status(404).json({ error: 'Email not found' });
      return;
    }

    const typedEmail = email as Email;

    if (typedEmail.status !== 'awaiting_approval') {
      res.status(400).json({
        error: `Cannot reject email with status: ${typedEmail.status}`,
      });
      return;
    }

    // Update email
    const { error: updateError } = await supabase
      .from('emails')
      .update({
        status: 'rejected',
        updated_at: new Date().toISOString(),
      })
      .eq('id', id);

    if (updateError) {
      res.status(500).json({ error: updateError.message });
      return;
    }

    // Audit log
    await supabase.from('audit_logs').insert({
      email_id: id,
      action: 'rejected',
      actor: 'user',
      details: { reason: reason || null },
    });

    res.json({ success: true, status: 'rejected' });
  })
);

// Error handling middleware
app.use((err: Error, _req: Request, res: Response, _next: NextFunction) => {
  console.error('Server error:', err);
  res.status(500).json({ error: 'Internal server error' });
});

// Start server
app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});

export default app;
