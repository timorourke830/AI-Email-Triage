import type { NextApiRequest, NextApiResponse, NextApiHandler } from 'next';
import { getSupabaseServerClient, getSupabaseServiceClient } from './supabase';

/**
 * Extended request type with authenticated user info
 */
export interface AuthenticatedRequest extends NextApiRequest {
  userId: string;
  clientId: string;
  userEmail: string;
}

/**
 * Handler type for authenticated API routes
 */
type AuthenticatedHandler = (
  req: AuthenticatedRequest,
  res: NextApiResponse
) => Promise<void> | void;

/**
 * Middleware to require authentication on API routes
 *
 * Usage:
 * ```typescript
 * async function handler(req: AuthenticatedRequest, res: NextApiResponse) {
 *   // req.userId, req.clientId, req.userEmail are available
 *   console.log(`User ${req.userId} with client ${req.clientId}`);
 * }
 * export default withAuth(handler);
 * ```
 */
export function withAuth(handler: AuthenticatedHandler): NextApiHandler {
  return async (req: NextApiRequest, res: NextApiResponse) => {
    const timestamp = new Date().toISOString();
    const endpoint = req.url || 'unknown';

    console.log(`[AUTH] ${timestamp} - withAuth middleware invoked for ${req.method} ${endpoint}`);

    try {
      const supabase = getSupabaseServerClient(req, res);

      // Get the current user from the session
      console.log(`[AUTH] ${timestamp} - Fetching user from session...`);
      const {
        data: { user },
        error: authError,
      } = await supabase.auth.getUser();

      if (authError || !user) {
        console.log(`[AUTH] ${timestamp} - No authenticated user found. AuthError: ${authError?.message || 'none'}`);
        return res.status(401).json({
          error: 'Unauthorized',
          message: 'Please sign in to access this resource',
        });
      }

      console.log(`[AUTH] ${timestamp} - User authenticated: ${user.id} (${user.email})`);

      // Get the client_id for this user using service client (bypass RLS for lookup)
      const serviceClient = getSupabaseServiceClient();

      // Primary lookup: by auth_user_id (linked via signup trigger)
      console.log(`[AUTH] ${timestamp} - Looking up client by auth_user_id: ${user.id}`);
      let { data: client, error: clientError } = await serviceClient
        .from('clients')
        .select('id')
        .eq('auth_user_id', user.id)
        .single();

      if (client) {
        console.log(`[AUTH] ${timestamp} - Client found by auth_user_id: ${client.id}`);
      }

      // Fallback: lookup by email if auth_user_id not found (pre-migration data)
      if (clientError || !client) {
        console.log(`[AUTH] ${timestamp} - Client not found by auth_user_id (error: ${clientError?.message || 'no match'}), trying email lookup...`);
        const emailResult = await serviceClient
          .from('clients')
          .select('id')
          .eq('email', user.email)
          .single();

        if (emailResult.data) {
          client = emailResult.data;
          clientError = null;
          console.log(`[AUTH] ${timestamp} - Client found by email: ${client.id}`);

          // Link this client to the auth user for future lookups
          await serviceClient
            .from('clients')
            .update({ auth_user_id: user.id })
            .eq('id', client.id);
          console.log(`[AUTH] ${timestamp} - Linked client ${client.id} to auth user ${user.id}`);
        } else {
          console.log(`[AUTH] ${timestamp} - Client not found by email either (error: ${emailResult.error?.message || 'no match'})`);
        }
      }

      if (clientError || !client) {
        console.error(`[AUTH] ${timestamp} - ERROR: No client found for user`, {
          userId: user.id,
          userEmail: user.email,
          error: clientError?.message,
        });
        return res.status(403).json({
          error: 'Forbidden',
          message: 'No client profile found for this user. Please try signing out and back in.',
        });
      }

      // Attach user info to the request
      const authenticatedReq = req as AuthenticatedRequest;
      authenticatedReq.userId = user.id;
      authenticatedReq.clientId = client.id;
      authenticatedReq.userEmail = user.email || '';

      console.log(`[AUTH] ${timestamp} - Authentication successful. User: ${user.id}, Client: ${client.id}, Email: ${user.email}`);

      // Call the handler with the authenticated request
      return handler(authenticatedReq, res);
    } catch (err) {
      console.error(`[AUTH] ${timestamp} - ERROR: Auth middleware exception:`, err);
      return res.status(500).json({
        error: 'Internal Server Error',
        message: 'An error occurred during authentication',
      });
    }
  };
}

/**
 * Optional authentication middleware - doesn't require auth but attaches user info if available
 *
 * Usage for routes that work with or without authentication:
 * ```typescript
 * async function handler(req: OptionalAuthRequest, res: NextApiResponse) {
 *   if (req.userId) {
 *     // User is authenticated
 *   } else {
 *     // User is not authenticated
 *   }
 * }
 * export default withOptionalAuth(handler);
 * ```
 */
export interface OptionalAuthRequest extends NextApiRequest {
  userId?: string;
  clientId?: string;
  userEmail?: string;
}

type OptionalAuthHandler = (
  req: OptionalAuthRequest,
  res: NextApiResponse
) => Promise<void> | void;

export function withOptionalAuth(handler: OptionalAuthHandler): NextApiHandler {
  return async (req: NextApiRequest, res: NextApiResponse) => {
    try {
      const supabase = getSupabaseServerClient(req, res);
      const optionalReq = req as OptionalAuthRequest;

      const {
        data: { user },
      } = await supabase.auth.getUser();

      if (user) {
        const serviceClient = getSupabaseServiceClient();

        // Primary lookup: by auth_user_id
        let { data: client } = await serviceClient
          .from('clients')
          .select('id')
          .eq('auth_user_id', user.id)
          .single();

        // Fallback: lookup by email
        if (!client) {
          const emailResult = await serviceClient
            .from('clients')
            .select('id')
            .eq('email', user.email)
            .single();
          client = emailResult.data;
        }

        if (client) {
          optionalReq.userId = user.id;
          optionalReq.clientId = client.id;
          optionalReq.userEmail = user.email || '';
        }
      }

      return handler(optionalReq, res);
    } catch (err) {
      console.error('Optional auth middleware error:', err);
      // Still allow the request to proceed without auth
      return handler(req as OptionalAuthRequest, res);
    }
  };
}