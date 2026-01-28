import { createClient, SupabaseClient } from '@supabase/supabase-js';
import { createBrowserClient, createServerClient } from '@supabase/ssr';
import type { NextApiRequest, NextApiResponse } from 'next';

// Module-level singleton for browser client
let browserClient: ReturnType<typeof createBrowserClient> | null = null;

/**
 * Create a Supabase client for browser-side usage
 * Uses the anon key and respects RLS policies
 * Returns a singleton instance to ensure consistent session state
 */
export function getSupabaseBrowserClient() {
  if (browserClient) {
    return browserClient;
  }

  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

  // Debug logging - safe to log URL (it's public), but not the key
  console.log('[Supabase] Initializing browser client:', {
    url: url || '(not set)',
    hasAnonKey: !!anonKey,
    anonKeyLength: anonKey?.length || 0,
  });

  if (!url || !anonKey) {
    console.error('[Supabase] Configuration missing:', {
      hasUrl: !!url,
      hasAnonKey: !!anonKey,
    });
    throw new Error(
      'Missing NEXT_PUBLIC_SUPABASE_URL or NEXT_PUBLIC_SUPABASE_ANON_KEY. Please check your environment variables.'
    );
  }

  // Validate URL format
  try {
    const parsedUrl = new URL(url);
    console.log('[Supabase] URL validated:', {
      protocol: parsedUrl.protocol,
      host: parsedUrl.host,
    });
  } catch (e) {
    console.error('[Supabase] Invalid URL format:', url);
    throw new Error(`Invalid NEXT_PUBLIC_SUPABASE_URL: ${url}`);
  }

  browserClient = createBrowserClient(url, anonKey);
  console.log('[Supabase] Browser client created successfully');
  return browserClient;
}

/**
 * Create a Supabase client for API routes with cookie-based auth
 * Handles session cookies automatically
 */
export function getSupabaseServerClient(
  req: NextApiRequest,
  res: NextApiResponse
): SupabaseClient {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

  if (!url || !anonKey) {
    throw new Error(
      'Missing NEXT_PUBLIC_SUPABASE_URL or NEXT_PUBLIC_SUPABASE_ANON_KEY'
    );
  }

  return createServerClient(url, anonKey, {
    cookies: {
      getAll: () => {
        return Object.entries(req.cookies).map(([name, value]) => ({
          name,
          value: value || '',
        }));
      },
      setAll: (cookies) => {
        cookies.forEach(({ name, value, options }) => {
          const cookieString = `${name}=${value}; Path=${options?.path || '/'}; HttpOnly; SameSite=Lax${options?.maxAge ? `; Max-Age=${options.maxAge}` : ''}`;
          res.setHeader('Set-Cookie', cookieString);
        });
      },
    },
  });
}

/**
 * Create a Supabase client with service role (admin) access
 * Bypasses RLS - use only for backend operations
 */
export function getSupabaseServiceClient(): SupabaseClient {
  const url = process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceKey = process.env.SUPABASE_SERVICE_KEY;

  if (!url || !serviceKey) {
    throw new Error('Missing SUPABASE_URL or SUPABASE_SERVICE_KEY');
  }

  return createClient(url, serviceKey);
}

/**
 * Legacy export for backward compatibility
 * @deprecated Use getSupabaseServiceClient instead
 */
export const getSupabaseClient = getSupabaseServiceClient;
