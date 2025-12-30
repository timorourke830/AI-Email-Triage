import { useEffect, useState } from 'react';
import { useRouter } from 'next/router';
import type { AppProps } from 'next/app';
import { getSupabaseBrowserClient } from '@/lib/supabase';
import { getSettings } from '@/lib/api';

// Pages that don't require authentication
const AUTH_ROUTES = ['/auth/signin', '/auth/signup'];

export default function App({ Component, pageProps }: AppProps) {
  const router = useRouter();
  const [checking, setChecking] = useState(true);
  const [isAuthenticated, setIsAuthenticated] = useState(false);

  useEffect(() => {
    const supabase = getSupabaseBrowserClient();

    async function checkAuth() {
      const { data: { session } } = await supabase.auth.getSession();
      const isOnAuthRoute = AUTH_ROUTES.includes(router.pathname);

      if (session) {
        setIsAuthenticated(true);

        // If authenticated and on auth route, redirect to home
        if (isOnAuthRoute) {
          router.replace('/');
          return;
        }

        // If authenticated, check if setup is completed (except for setup page)
        if (router.pathname !== '/setup') {
          try {
            const { settings } = await getSettings();
            if (!settings?.setup_completed) {
              router.replace('/setup');
              return;
            }
          } catch {
            // Settings fetch failed, redirect to setup
            router.replace('/setup');
            return;
          }
        }

        setChecking(false);
      } else {
        setIsAuthenticated(false);

        // If not authenticated and not on auth route, redirect to sign in
        if (!isOnAuthRoute) {
          router.replace('/auth/signin');
          return;
        }

        setChecking(false);
      }
    }

    checkAuth();

    // Listen for auth state changes
    const { data: { subscription } } = supabase.auth.onAuthStateChange((event, session) => {
      if (event === 'SIGNED_OUT') {
        setIsAuthenticated(false);
        router.replace('/auth/signin');
      } else if (event === 'SIGNED_IN' && session) {
        setIsAuthenticated(true);
        // Let the next page load handle setup check
        if (AUTH_ROUTES.includes(router.pathname)) {
          router.replace('/');
        }
      }
    });

    return () => {
      subscription.unsubscribe();
    };
  }, [router.pathname]);

  // Show loading state while checking auth
  if (checking) {
    return (
      <>
        <style jsx global>{`
          * {
            box-sizing: border-box;
            margin: 0;
            padding: 0;
          }
          html, body {
            font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto,
              Oxygen, Ubuntu, Cantarell, 'Fira Sans', 'Droid Sans',
              'Helvetica Neue', sans-serif;
            background-color: #f9fafb;
            color: #111827;
            line-height: 1.5;
          }
        `}</style>
        <div style={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
          <p>Loading...</p>
        </div>
      </>
    );
  }

  return (
    <>
      <style jsx global>{`
        * {
          box-sizing: border-box;
          margin: 0;
          padding: 0;
        }

        html,
        body {
          font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto,
            Oxygen, Ubuntu, Cantarell, 'Fira Sans', 'Droid Sans',
            'Helvetica Neue', sans-serif;
          background-color: #f9fafb;
          color: #111827;
          line-height: 1.5;
        }

        a {
          color: inherit;
          text-decoration: none;
        }

        button {
          cursor: pointer;
        }

        button:disabled {
          opacity: 0.6;
          cursor: not-allowed;
        }
      `}</style>
      <Component {...pageProps} />
    </>
  );
}
