import type { NextApiRequest, NextApiResponse } from 'next';
import { getSupabaseServerClient, getSupabaseServiceClient } from '@/lib/supabase';

/**
 * POST /api/auth/init-client
 *
 * Creates a client record for a newly signed up user.
 * This is called immediately after auth signup to ensure
 * the client record exists before accessing other endpoints.
 *
 * This endpoint does NOT use the withAuth middleware because
 * the client record doesn't exist yet - that's what we're creating.
 */
export default async function handler(
  req: NextApiRequest,
  res: NextApiResponse
) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    // Get the authenticated user from the session
    const supabase = getSupabaseServerClient(req, res);
    const {
      data: { user },
      error: authError,
    } = await supabase.auth.getUser();

    if (authError || !user) {
      return res.status(401).json({
        error: 'Unauthorized',
        message: 'Please sign in to access this resource',
      });
    }

    // Use service client to bypass RLS for this operation
    const serviceClient = getSupabaseServiceClient();

    // Check if client already exists by auth_user_id
    let { data: existingClient } = await serviceClient
      .from('clients')
      .select('id')
      .eq('auth_user_id', user.id)
      .single();

    // If not found by auth_user_id, check by email (pre-migration data)
    if (!existingClient && user.email) {
      const { data: clientByEmail } = await serviceClient
        .from('clients')
        .select('id, auth_user_id')
        .eq('email', user.email)
        .single();

      if (clientByEmail) {
        // Link this client to the auth user
        if (!clientByEmail.auth_user_id) {
          await serviceClient
            .from('clients')
            .update({ auth_user_id: user.id })
            .eq('id', clientByEmail.id);
          console.log('Linked existing client by email to auth user:', clientByEmail.id);
        }
        existingClient = { id: clientByEmail.id };
      }
    }

    if (existingClient) {
      // Client already exists, check if settings exist
      const { data: existingSettings } = await serviceClient
        .from('client_settings')
        .select('id')
        .eq('client_id', existingClient.id)
        .single();

      if (!existingSettings) {
        // Create client_settings if they don't exist
        await serviceClient
          .from('client_settings')
          .insert({ client_id: existingClient.id });
      }

      return res.status(200).json({
        success: true,
        client_id: existingClient.id,
        message: 'Client already exists',
      });
    }

    // Create the client record
    const userName = user.user_metadata?.name ||
                     user.email?.split('@')[0] ||
                     'User';

    const { data: newClient, error: clientError } = await serviceClient
      .from('clients')
      .insert({
        auth_user_id: user.id,
        name: userName,
        email: user.email,
      })
      .select('id')
      .single();

    if (clientError) {
      console.error('Error creating client:', {
        error: clientError,
        userId: user.id,
        userEmail: user.email,
        userName,
      });
      return res.status(500).json({
        error: 'Database error',
        message: `Failed to create client record: ${clientError.message}`,
      });
    }

    console.log('Created new client:', { clientId: newClient.id, userId: user.id, email: user.email });

    // Create client_settings for the new client
    const { error: settingsError } = await serviceClient
      .from('client_settings')
      .insert({ client_id: newClient.id });

    if (settingsError) {
      console.error('Error creating client_settings:', settingsError);
      // Don't fail the request - client was created successfully
      // Settings can be created later
    }

    return res.status(201).json({
      success: true,
      client_id: newClient.id,
      message: 'Client created successfully',
    });
  } catch (err) {
    console.error('Init client error:', err);
    return res.status(500).json({
      error: 'Internal Server Error',
      message: err instanceof Error ? err.message : 'An error occurred',
    });
  }
}
