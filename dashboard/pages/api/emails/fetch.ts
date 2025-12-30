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
import type { NormalizedEmail } from '../../../lib/gmail-imap';

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
  const timestamp = new Date().toISOString();

  console.log(`[FETCH-API] ${timestamp} - Request received: ${req.method} /api/emails/fetch`);

  if (req.method !== 'POST') {
    console.log(`[FETCH-API] ${timestamp} - ERROR: Method not allowed: ${req.method}`);
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

  const { clientId, userId, userEmail } = req;
  const { sinceDays = 7, unreadOnly = false, maxEmails = 50 } = req.body || {};

  console.log(`[FETCH-API] ${timestamp} - Authentication verified:`, {
    userId,
    clientId,
    userEmail,
  });
  console.log(`[FETCH-API] ${timestamp} - Request parameters:`, {
    sinceDays,
    unreadOnly,
    maxEmails,
  });

  // Check if email is configured
  console.log(`[FETCH-API] ${timestamp} - Checking email configuration for client ${clientId}...`);
  const configured = await isEmailConfigured(clientId);

  if (!configured) {
    console.error(`[FETCH-API] ${timestamp} - ERROR: Email not configured for client ${clientId}`);
    res.status(400).json({
      success: false,
      fetched: 0,
      stored: 0,
      duplicates: 0,
      error: 'Email not configured. Please complete setup first.',
    });
    return;
  }

  console.log(`[FETCH-API] ${timestamp} - Email configuration verified for client ${clientId}`);

  // Fetch emails from provider
  console.log(`[FETCH-API] ${timestamp} - Fetching emails from provider...`);
  const result = await fetchEmails({
    clientId,
    sinceDays: Math.min(sinceDays, 30), // Cap at 30 days
    unreadOnly,
    maxEmails: Math.min(maxEmails, 100), // Cap at 100
  });

  console.log(`[FETCH-API] ${timestamp} - Fetch result:`, {
    success: result.success,
    provider: result.provider,
    emailCount: result.emails.length,
    error: result.error || 'none',
  });

  if (!result.success) {
    console.error(`[FETCH-API] ${timestamp} - ERROR: Email fetch failed:`, result.error);
    res.status(500).json({
      success: false,
      fetched: 0,
      stored: 0,
      duplicates: 0,
      error: result.error,
    });
    return;
  }

  console.log(`[FETCH-API] ${timestamp} - Successfully fetched ${result.emails.length} emails from ${result.provider}`);

  // Store new emails in database
  console.log(`[FETCH-API] ${timestamp} - Storing emails in database...`);
  const supabase = getSupabaseServiceClient();
  let stored = 0;
  let duplicates = 0;
  let errors = 0;

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
    const { data: inserted, error: insertError } = await supabase.from('emails').insert({
      client_id: clientId,
      external_id: email.external_id,
      from_address: email.from_address,
      to_address: email.to_address,
      subject: email.subject,
      body: email.body,
      status: 'pending',
      created_at: email.received_at.toISOString(),
    }).select('id').single();

    if (!insertError && inserted) {
      stored++;
      console.log(`[FETCH-API] ${timestamp} - Stored email ${inserted.id}: "${email.subject?.substring(0, 50)}..."`);
    } else {
      errors++;
      console.error(`[FETCH-API] ${timestamp} - ERROR: Failed to insert email "${email.subject?.substring(0, 30)}...":`, {
        error: insertError?.message,
        code: insertError?.code,
        details: insertError?.details,
      });
    }
  }

  console.log(`[FETCH-API] ${timestamp} - Database storage complete:`, {
    total: result.emails.length,
    stored,
    duplicates,
    errors,
  });

  // Note: We don't create an audit log here since audit_logs requires email_id
  // The fetch action is logged implicitly through the emails created

  console.log(`[FETCH-API] ${timestamp} - Request complete. Returning success response.`);
  res.status(200).json({
    success: true,
    fetched: result.emails.length,
    stored,
    duplicates,
  });
}

export default withAuth(handler);
