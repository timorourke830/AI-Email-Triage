import type { NextApiRequest, NextApiResponse } from 'next';
import crypto from 'crypto';
import { getSupabaseServiceClient } from '@/lib/supabase';
import { exchangeCodeForTokens, getUserProfile } from '@/lib/microsoft-graph';
import { encrypt, decrypt } from '@/lib/encryption';

/**
 * GET /api/auth/microsoft/callback
 *
 * Handles Microsoft OAuth2 callback after user authorizes the app.
 * Exchanges authorization code for tokens and stores them.
 */
export default async function handler(
  req: NextApiRequest,
  res: NextApiResponse
) {
  if (req.method !== 'GET') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const { code, state, error: oauthError, error_description } = req.query;

  // Handle OAuth errors
  if (oauthError) {
    console.error('Microsoft OAuth error:', oauthError, error_description);
    return res.redirect(
      `/setup?error=${encodeURIComponent(String(error_description || oauthError))}&oauth=failed`
    );
  }

  if (!code || typeof code !== 'string') {
    return res.redirect('/setup?error=Missing authorization code&oauth=failed');
  }

  if (!state || typeof state !== 'string') {
    return res.redirect('/setup?error=Missing state parameter&oauth=failed');
  }

  try {
    // Parse state to get client ID
    const [clientId, stateToken] = state.split(':');

    if (!clientId || !stateToken) {
      return res.redirect('/setup?error=Invalid state parameter&oauth=failed');
    }

    // Verify state from cookie
    const stateCookie = req.cookies.ms_oauth_state;
    if (stateCookie) {
      const [cookieState, cookieHash] = stateCookie.split(':');

      if (!process.env.ENCRYPTION_KEY) {
        console.error('ENCRYPTION_KEY environment variable is not set');
        return res.redirect('/setup?error=Server configuration error&oauth=failed');
      }

      const expectedHash = crypto
        .createHmac('sha256', process.env.ENCRYPTION_KEY)
        .update(cookieState)
        .digest('hex');

      if (cookieState !== stateToken || cookieHash !== expectedHash) {
        console.error('State mismatch - possible CSRF attack');
        return res.redirect('/setup?error=Invalid state - please try again&oauth=failed');
      }
    }

    // Get client credentials from database
    const serviceClient = getSupabaseServiceClient();
    const { data: settings, error: settingsError } = await serviceClient
      .from('client_settings')
      .select('microsoft_client_id, microsoft_client_secret_encrypted')
      .eq('client_id', clientId)
      .single();

    if (settingsError || !settings) {
      console.error('Failed to get client settings:', settingsError);
      return res.redirect('/setup?error=Client not found&oauth=failed');
    }

    if (!settings.microsoft_client_id || !settings.microsoft_client_secret_encrypted) {
      return res.redirect('/setup?error=Microsoft credentials not found&oauth=failed');
    }

    const clientSecret = decrypt(settings.microsoft_client_secret_encrypted);

    // Build redirect URI (must match the one used in authorize)
    const protocol = req.headers['x-forwarded-proto'] || 'http';
    const host = req.headers['x-forwarded-host'] || req.headers.host;
    const redirectUri = process.env.MICROSOFT_REDIRECT_URI ||
      `${protocol}://${host}/api/auth/microsoft/callback`;

    // Exchange code for tokens
    const tokens = await exchangeCodeForTokens({
      code,
      clientId: settings.microsoft_client_id,
      clientSecret,
      redirectUri,
    });

    // Get user profile to verify connection and get email
    const profile = await getUserProfile(tokens.access_token);
    const email = profile.mail || profile.userPrincipalName;

    // Calculate token expiry
    const expiresAt = new Date(Date.now() + tokens.expires_in * 1000);

    // Store tokens and update settings
    const { error: updateError } = await serviceClient
      .from('client_settings')
      .update({
        email_address: email,
        email_provider: 'outlook',
        email_credentials_verified: true,
        email_credentials_verified_at: new Date().toISOString(),
        microsoft_access_token_encrypted: encrypt(tokens.access_token),
        microsoft_refresh_token_encrypted: encrypt(tokens.refresh_token),
        microsoft_token_expires: expiresAt.toISOString(),
        // Clear any old app password since we're using OAuth now
        email_password_encrypted: null,
      })
      .eq('client_id', clientId);

    if (updateError) {
      console.error('Failed to store tokens:', updateError);
      return res.redirect('/setup?error=Failed to save tokens&oauth=failed');
    }

    // Clear the state cookie
    res.setHeader(
      'Set-Cookie',
      'ms_oauth_state=; Path=/; HttpOnly; SameSite=Lax; Max-Age=0'
    );

    // Redirect back to setup with success
    return res.redirect(`/setup?oauth=success&email=${encodeURIComponent(email)}`);
  } catch (err) {
    console.error('Microsoft OAuth callback error:', err);
    const errorMessage = err instanceof Error ? err.message : 'Authentication failed';
    return res.redirect(`/setup?error=${encodeURIComponent(errorMessage)}&oauth=failed`);
  }
}
