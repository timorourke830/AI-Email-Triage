import type { NextApiResponse } from 'next';
import { withAuth, AuthenticatedRequest } from '@/lib/auth';
import { getSupabaseServiceClient } from '@/lib/supabase';

async function handler(req: AuthenticatedRequest, res: NextApiResponse) {
  if (req.method !== 'GET') {
    res.setHeader('Allow', ['GET']);
    res.status(405).json({ error: 'Method not allowed' });
    return;
  }

  try {
    const supabase = getSupabaseServiceClient();
    const { status, page = '1', limit = '20' } = req.query;

    // Validate pagination parameters
    const pageNum = Math.max(1, parseInt(page as string, 10) || 1);
    const limitNum = Math.min(Math.max(1, parseInt(limit as string, 10) || 20), 100);
    const offset = (pageNum - 1) * limitNum;

    // Validate status filter against allowed enum values
    const validStatuses = ['pending', 'processing', 'awaiting_approval', 'sent', 'rejected'];
    if (status && typeof status === 'string' && !validStatuses.includes(status)) {
      return res.status(400).json({ error: 'Invalid status filter' });
    }

    let query = supabase
      .from('emails')
      .select('*', { count: 'exact' })
      .eq('client_id', req.clientId) // Always filter by authenticated user's client
      .order('created_at', { ascending: false })
      .range(offset, offset + limitNum - 1);

    if (status && typeof status === 'string') {
      query = query.eq('status', status);
    }

    const { data, count, error } = await query;

    if (error) {
      res.status(500).json({ error: error.message });
      return;
    }

    res.status(200).json({
      emails: data,
      pagination: {
        page: pageNum,
        limit: limitNum,
        total: count || 0,
        pages: Math.ceil((count || 0) / limitNum),
      },
    });
  } catch (err) {
    console.error('API error:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
}

export default withAuth(handler);
