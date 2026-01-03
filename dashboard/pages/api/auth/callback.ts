import { createServerClient } from '@supabase/ssr';
import type { NextApiRequest, NextApiResponse } from 'next';

export default async function handler(
  req: NextApiRequest,
  res: NextApiResponse
) {
  const { code, type, next } = req.query;

  if (!code || typeof code !== 'string') {
    console.error('[auth/callback] No code provided');
    return res.redirect('/auth/signin?error=no_code');
  }

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll: () => {
          return Object.entries(req.cookies).map(([name, value]) => ({
            name,
            value: value || '',
          }));
        },
        setAll: (cookiesToSet) => {
          cookiesToSet.forEach(({ name, value, options }) => {
            res.setHeader(
              'Set-Cookie',
              `${name}=${value}; Path=${options?.path || '/'}; ${options?.httpOnly ? 'HttpOnly;' : ''} SameSite=Lax${options?.maxAge ? `; Max-Age=${options.maxAge}` : ''}${options?.secure ? '; Secure' : ''}`
            );
          });
        },
      },
    }
  );

  console.log('[auth/callback] Exchanging code for session...');

  const { data, error } = await supabase.auth.exchangeCodeForSession(code);

  if (error) {
    console.error('[auth/callback] Code exchange failed:', error.message);
    return res.redirect(`/auth/signin?error=${encodeURIComponent(error.message)}`);
  }

  console.log('[auth/callback] Code exchange successful, session established');

  // Determine redirect destination based on type or next parameter
  let redirectTo = '/';

  if (type === 'recovery') {
    redirectTo = '/auth/reset-password';
  } else if (type === 'signup' || type === 'email') {
    redirectTo = '/';
  } else if (next && typeof next === 'string') {
    // Validate next URL to prevent open redirects
    if (next.startsWith('/')) {
      redirectTo = next;
    }
  }

  console.log('[auth/callback] Redirecting to:', redirectTo);
  return res.redirect(redirectTo);
}
