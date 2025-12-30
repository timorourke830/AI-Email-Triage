import type { NextApiRequest, NextApiResponse } from 'next';
import crypto from 'crypto';
import { getSupabaseServerClient, getSupabaseServiceClient } from '@/lib/supabase';
import { generateAuthUrl } from '@/lib/microsoft-graph';
import { encrypt } from '@/lib/encryption';

/**
 * POST /api/auth/microsoft/authorize
 *
 * Initiates Microsoft OAuth2 flow for Outlook/Hotmail email access.
 *
 * Body:
 * - microsoft_client_id: string - Azure App Registration Client ID
 * - microsoft_client_secret: string - Azure App Registration Client Secret
 *
 * Returns JSON with:
 * - auth_url: string - URL to redirect user to for Microsoft login
 */
export default async function handler(
  req: NextApiRequest,
  res: NextApiResponse
) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    // Get authenticated user
    const supabase = getSupabaseServerClient(req, res);
    const {
      data: { user },
      error: authError,
    } = await supabase.auth.getUser();

    if (authError || !user) {
      return res.status(401).json({
        error: 'Unauthorized',
        message: 'Please sign in to connect your Microsoft account',
      });
    }

    // Get client ID from database
    const serviceClient = getSupabaseServiceClient();
    const { data: client, error: clientError } = await serviceClient
      .from('clients')
      .select('id')
      .eq('auth_user_id', user.id)
      .single();

    if (clientError || !client) {
      return res.status(403).json({
        error: 'Forbidden',
        message: 'No client profile found',
      });
    }

    // Get Microsoft credentials from request body or environment
    let { microsoft_client_id, microsoft_client_secret } = req.body;

    // Fall back to environment variables if not provided
    if (!microsoft_client_id) {
      microsoft_client_id = process.env.MICROSOFT_CLIENT_ID;
    }
    if (!microsoft_client_secret) {
      microsoft_client_secret = process.env.MICROSOFT_CLIENT_SECRET;
    }

    if (!microsoft_client_id || !microsoft_client_secret) {
      return res.status(400).json({
        error: 'Missing credentials',
        message: 'Microsoft Client ID and Client Secret are required. Please provide them or configure MICROSOFT_CLIENT_ID and MICROSOFT_CLIENT_SECRET environment variables.',
      });
    }

    // Generate CSRF state token
    const state = crypto.randomBytes(32).toString('hex');

    // Build redirect URI
    const protocol = req.headers['x-forwarded-proto'] || 'http';
    const host = req.headers['x-forwarded-host'] || req.headers.host;
    const redirectUri = process.env.MICROSOFT_REDIRECT_URI ||
      `${protocol}://${host}/api/auth/microsoft/callback`;

    // Store OAuth state and credentials temporarily in client_settings
    // The state allows us to verify the callback and retrieve credentials
    const { error: updateError } = await serviceClient
      .from('client_settings')
      .update({
        microsoft_client_id,
        microsoft_client_secret_encrypted: encrypt(microsoft_client_secret),
        // Store state in a way we can verify it (using the token expires field temporarily)
        // A proper implementation would use a separate oauth_state table with expiry
      })
      .eq('client_id', client.id);

    if (updateError) {
      console.error('Failed to store OAuth credentials:', updateError);
      return res.status(500).json({
        error: 'Database error',
        message: 'Failed to store OAuth credentials',
      });
    }

    // Generate authorization URL
    const authUrl = generateAuthUrl({
      clientId: microsoft_client_id,
      redirectUri,
      state: `${client.id}:${state}`, // Include client ID in state for callback
    });

    // Store state in a cookie for verification (signed with a hash)
    const stateHash = crypto
      .createHmac('sha256', process.env.ENCRYPTION_KEY || 'fallback-key')
      .update(state)
      .digest('hex');

    res.setHeader(
      'Set-Cookie',
      `ms_oauth_state=${state}:${stateHash}; Path=/; HttpOnly; SameSite=Lax; Max-Age=600`
    );

    return res.status(200).json({
      auth_url: authUrl,
      redirect_uri: redirectUri,
    });
  } catch (err) {
    console.error('Microsoft OAuth authorize error:', err);
    return res.status(500).json({
      error: 'Internal Server Error',
      message: err instanceof Error ? err.message : 'An error occurred',
    });
  }
}
