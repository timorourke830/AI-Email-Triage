import type { NextApiResponse } from 'next';
import { withAuth, AuthenticatedRequest } from '@/lib/auth';
import { getSupabaseServiceClient } from '@/lib/supabase';

async function handler(req: AuthenticatedRequest, res: NextApiResponse) {
  if (req.method !== 'GET') {
    res.setHeader('Allow', ['GET']);
    res.status(405).json({ error: 'Method not allowed' });
    return;
  }

  const { id } = req.query;

  if (!id || typeof id !== 'string') {
    res.status(400).json({ error: 'Invalid email ID' });
    return;
  }

  try {
    const supabase = getSupabaseServiceClient();

    const [emailResult, attachmentsResult, logsResult] = await Promise.all([
      supabase
        .from('emails')
        .select('*')
        .eq('id', id)
        .eq('client_id', req.clientId) // Ensure user can only access their own emails
        .single(),
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

    res.status(200).json({
      email: emailResult.data,
      attachments: attachmentsResult.data || [],
      audit_logs: logsResult.data || [],
    });
  } catch (err) {
    console.error('API error:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
}

export default withAuth(handler);
