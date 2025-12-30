import type { NextApiResponse } from 'next';
import { withAuth, AuthenticatedRequest } from '@/lib/auth';
import { getSupabaseServiceClient } from '@/lib/supabase';
import { encrypt } from '@/lib/encryption';

interface SaveCredentialsRequest {
  email_address: string;
  email_password: string;
  email_provider: 'gmail' | 'outlook';
}

async function handler(req: AuthenticatedRequest, res: NextApiResponse) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const { email_address, email_password, email_provider } =
    req.body as SaveCredentialsRequest;

  // Validate input
  if (!email_address || !email_password || !email_provider) {
    return res.status(400).json({
      error: 'Missing required fields',
      message: 'email_address, email_password, and email_provider are required',
    });
  }

  if (!['gmail', 'outlook'].includes(email_provider)) {
    return res.status(400).json({
      error: 'Invalid provider',
      message: 'email_provider must be "gmail" or "outlook"',
    });
  }

  try {
    // Encrypt the password
    const encryptedPassword = encrypt(email_password);

    // Update client_settings with the encrypted credentials
    const supabase = getSupabaseServiceClient();
    const { error: updateError } = await supabase
      .from('client_settings')
      .update({
        email_address,
        email_password_encrypted: encryptedPassword,
        email_provider,
        email_credentials_verified: true,
        email_credentials_verified_at: new Date().toISOString(),
      })
      .eq('client_id', req.clientId);

    if (updateError) {
      console.error('Failed to save credentials:', updateError);
      return res.status(500).json({
        error: 'Database error',
        message: 'Failed to save email credentials',
      });
    }

    return res.status(200).json({ success: true });
  } catch (err) {
    console.error('Encryption error:', err);
    return res.status(500).json({
      error: 'Encryption error',
      message: 'Failed to encrypt email credentials',
    });
  }
}

export default withAuth(handler);
