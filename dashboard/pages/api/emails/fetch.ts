/**
 * API endpoint to fetch emails from the user's configured email provider
 * POST /api/emails/fetch
 *
 * Fetches new emails and stores them in the database.
 * Skips duplicates based on external_id.
 */

import type { NextApiResponse } from 'next';
import { withAuth, AuthenticatedRequest } from '../../../lib/auth';
import { getSupabaseServiceClient } from '../../../lib/supabase';
import { fetchEmails, isEmailConfigured } from '../../../lib/email-fetcher';

interface FetchResponse {
  success: boolean;
  fetched: number;
  stored: number;
  duplicates: number;
  error?: string;
}

async function handler(
  req: AuthenticatedRequest,
  res: NextApiResponse<FetchResponse>
): Promise<void> {
  if (req.method !== 'POST') {
    res.setHeader('Allow', ['POST']);
    res.status(405).json({
      success: false,
      fetched: 0,
      stored: 0,
      duplicates: 0,
      error: 'Method not allowed',
    });
    return;
  }

  const { clientId } = req;
  const { sinceDays = 7, unreadOnly = false, maxEmails = 50 } = req.body || {};

  // Check if email is configured
  const configured = await isEmailConfigured(clientId);

  if (!configured) {
    console.error('[FETCH-API] Email not configured for client:', clientId);
    res.status(400).json({
      success: false,
      fetched: 0,
      stored: 0,
      duplicates: 0,
      error: 'Email not configured. Please complete setup first.',
    });
    return;
  }

  // Fetch emails from provider
  const result = await fetchEmails({
    clientId,
    sinceDays: Math.min(sinceDays, 30), // Cap at 30 days
    unreadOnly,
    maxEmails: Math.min(maxEmails, 100), // Cap at 100
  });

  if (!result.success) {
    console.error('[FETCH-API] Email fetch failed:', result.error);
    res.status(500).json({
      success: false,
      fetched: 0,
      stored: 0,
      duplicates: 0,
      error: result.error,
    });
    return;
  }

  // Store new emails in database
  const supabase = getSupabaseServiceClient();
  let stored = 0;
  let duplicates = 0;

  for (const email of result.emails) {
    // Check for existing email with same external_id
    const { data: existing } = await supabase
      .from('emails')
      .select('id')
      .eq('client_id', clientId)
      .eq('external_id', email.external_id)
      .single();

    if (existing) {
      duplicates++;
      continue;
    }

    // Insert new email
    const { error: insertError } = await supabase.from('emails').insert({
      client_id: clientId,
      external_id: email.external_id,
      from_address: email.from_address,
      to_address: email.to_address,
      subject: email.subject,
      body: email.body,
      status: 'pending',
      created_at: email.received_at.toISOString(),
    });

    if (!insertError) {
      stored++;
    } else {
      console.error('[FETCH-API] Failed to insert email:', insertError?.message);
    }
  }

  res.status(200).json({
    success: true,
    fetched: result.emails.length,
    stored,
    duplicates,
  });
}

export default withAuth(handler);
