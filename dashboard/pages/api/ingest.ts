import type { NextApiResponse } from 'next';
import { withAuth, AuthenticatedRequest } from '@/lib/auth';
import { getSupabaseServiceClient } from '@/lib/supabase';

async function handler(req: AuthenticatedRequest, res: NextApiResponse) {
  if (req.method !== 'POST') {
    res.setHeader('Allow', ['POST']);
    res.status(405).json({ error: 'Method not allowed' });
    return;
  }

  try {
    const supabase = getSupabaseServiceClient();

    // Get client settings to determine ingest_since_days
    const { data: settings } = await supabase
      .from('client_settings')
      .select('ingest_since_days')
      .eq('client_id', req.clientId)
      .single();

    const sinceDays = settings?.ingest_since_days || 7;

    // Note: In a production setup, this would trigger the actual ingest process
    // via a background job queue, serverless function, or external service.
    // For now, we return the parameters that would be used.
    // The user can run `pnpm ingest --client <client_id> --since <days>` manually or set up a cron job.

    res.status(200).json({
      success: true,
      triggered: true,
      clientId: req.clientId,
      sinceDays,
      message: `Ingestion configured for last ${sinceDays} days. Run 'pnpm ingest --client ${req.clientId} --since ${sinceDays}' to fetch emails.`,
    });
  } catch (err) {
    console.error('API error:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
}

export default withAuth(handler);
