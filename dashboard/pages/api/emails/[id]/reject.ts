import type { NextApiResponse } from 'next';
import { withAuth, AuthenticatedRequest } from '@/lib/auth';
import { getSupabaseServiceClient } from '@/lib/supabase';
import type { Email } from '@/lib/types';

async function handler(req: AuthenticatedRequest, res: NextApiResponse) {
  if (req.method !== 'POST') {
    res.setHeader('Allow', ['POST']);
    res.status(405).json({ error: 'Method not allowed' });
    return;
  }

  const { id } = req.query;
  const { reason } = req.body as { reason?: string };

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

    res.status(200).json({ success: true, status: 'rejected' });
  } catch (err) {
    console.error('API error:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
}

export default withAuth(handler);
