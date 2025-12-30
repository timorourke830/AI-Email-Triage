import type { NextApiResponse } from 'next';
import { withAuth, AuthenticatedRequest } from '@/lib/auth';
import { getSupabaseServiceClient } from '@/lib/supabase';

async function handler(req: AuthenticatedRequest, res: NextApiResponse) {
  const supabase = getSupabaseServiceClient();

  if (req.method === 'GET') {
    try {
      const { data, error } = await supabase
        .from('client_settings')
        .select('*')
        .eq('client_id', req.clientId)
        .single();

      // PGRST116 = no rows found, which is ok for new clients
      if (error && error.code !== 'PGRST116') {
        res.status(500).json({ error: error.message });
        return;
      }

      res.status(200).json({ settings: data || null });
    } catch (err) {
      console.error('API error:', err);
      res.status(500).json({ error: 'Internal server error' });
    }
    return;
  }

  if (req.method === 'PUT') {
    try {
      const updates = req.body;

      // Remove fields that shouldn't be updated directly
      delete updates.id;
      delete updates.client_id;
      delete updates.created_at;
      // Don't allow updating email credentials via this endpoint
      delete updates.email_address;
      delete updates.email_password_encrypted;
      delete updates.email_provider;
      delete updates.email_credentials_verified;
      delete updates.email_credentials_verified_at;

      const { data, error } = await supabase
        .from('client_settings')
        .upsert(
          {
            client_id: req.clientId,
            ...updates,
            updated_at: new Date().toISOString(),
          },
          {
            onConflict: 'client_id',
          }
        )
        .select()
        .single();

      if (error) {
        res.status(500).json({ error: error.message });
        return;
      }

      res.status(200).json({ settings: data });
    } catch (err) {
      console.error('API error:', err);
      res.status(500).json({ error: 'Internal server error' });
    }
    return;
  }

  res.setHeader('Allow', ['GET', 'PUT']);
  res.status(405).json({ error: 'Method not allowed' });
}

export default withAuth(handler);
