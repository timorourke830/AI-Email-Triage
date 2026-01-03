/**
 * API endpoint to fetch dashboard statistics
 * GET /api/dashboard/stats
 */

import type { NextApiResponse } from 'next';
import { withAuth, AuthenticatedRequest } from '../../../lib/auth';
import { getSupabaseServiceClient } from '../../../lib/supabase';

interface StatsResponse {
  success: boolean;
  stats?: {
    total: number;
    byStatus: {
      pending: number;
      processing: number;
      awaiting_approval: number;
      sent: number;
      rejected: number;
    };
    byClassification: {
      inquiry: number;
      complaint: number;
      support: number;
      billing: number;
      spam: number;
      other: number;
      unclassified: number;
    };
  };
  error?: string;
}

async function handler(
  req: AuthenticatedRequest,
  res: NextApiResponse<StatsResponse>
): Promise<void> {
  if (req.method !== 'GET') {
    res.setHeader('Allow', ['GET']);
    res.status(405).json({ success: false, error: 'Method not allowed' });
    return;
  }

  const { clientId } = req;
  const supabase = getSupabaseServiceClient();

  try {
    // Fetch all emails for this client to calculate stats
    const { data: emails, error } = await supabase
      .from('emails')
      .select('status, classification')
      .eq('client_id', clientId);

    if (error) {
      console.error('[STATS-API] Failed to fetch emails:', error);
      res.status(500).json({ success: false, error: 'Failed to fetch statistics' });
      return;
    }

    // Initialize counters
    const byStatus = {
      pending: 0,
      processing: 0,
      awaiting_approval: 0,
      sent: 0,
      rejected: 0,
    };

    const byClassification = {
      inquiry: 0,
      complaint: 0,
      support: 0,
      billing: 0,
      spam: 0,
      other: 0,
      unclassified: 0,
    };

    // Count emails
    for (const email of emails || []) {
      // Count by status
      if (email.status && email.status in byStatus) {
        byStatus[email.status as keyof typeof byStatus]++;
      }

      // Count by classification
      if (email.classification && email.classification in byClassification) {
        byClassification[email.classification as keyof typeof byClassification]++;
      } else if (!email.classification) {
        byClassification.unclassified++;
      }
    }

    res.status(200).json({
      success: true,
      stats: {
        total: emails?.length || 0,
        byStatus,
        byClassification,
      },
    });
  } catch (err) {
    console.error('[STATS-API] Error:', err);
    res.status(500).json({ success: false, error: 'Internal server error' });
  }
}

export default withAuth(handler);
