import { useEffect, useState } from 'react';
import { useRouter } from 'next/router';
import type { AppProps } from 'next/app';
import type { AuthChangeEvent, Session } from '@supabase/supabase-js';
import { getSupabaseBrowserClient } from '@/lib/supabase';
import { getSettings } from '@/lib/api';
import { ThemeProvider } from '@/lib/theme';
import '@/styles/globals.css';

// Pages that don't require authentication
const AUTH_ROUTES = ['/auth/signin', '/auth/signup', '/auth/forgot-password', '/auth/reset-password', '/auth/confirm'];

function LoadingScreen() {
  return (
    <div className="min-h-screen flex items-center justify-center bg-slate-50 dark:bg-slate-900">
      <div className="flex flex-col items-center gap-4">
        <div className="w-10 h-10 rounded-lg bg-primary-600 flex items-center justify-center animate-pulse">
          <svg className="w-5 h-5 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 8l7.89 5.26a2 2 0 002.22 0L21 8M5 19h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z" />
          </svg>
        </div>
        <p className="text-sm text-slate-500 dark:text-slate-400">Loading...</p>
      </div>
    </div>
  );
}

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
        // EXCEPT for reset-password and confirm pages - user needs to complete these flows first
        if (isOnAuthRoute && router.pathname !== '/auth/reset-password' && router.pathname !== '/auth/confirm') {
          router.replace('/');
          return;
        }

        // If authenticated, check if setup is completed (except for setup, reset-password, and confirm pages)
        // Skip setup check for reset-password and confirm - user needs to complete these flows first
        if (router.pathname !== '/setup' && router.pathname !== '/auth/reset-password' && router.pathname !== '/auth/confirm') {
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
    const { data: { subscription } } = supabase.auth.onAuthStateChange((event: AuthChangeEvent, session: Session | null) => {
      if (event === 'SIGNED_OUT') {
        setIsAuthenticated(false);
        router.replace('/auth/signin');
      } else if (event === 'SIGNED_IN' && session) {
        setIsAuthenticated(true);
        // Let the next page load handle setup check
        // EXCEPT for reset-password and confirm pages - user needs to complete these flows first
        if (AUTH_ROUTES.includes(router.pathname) && router.pathname !== '/auth/reset-password' && router.pathname !== '/auth/confirm') {
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
      <ThemeProvider>
        <LoadingScreen />
      </ThemeProvider>
    );
  }

  return (
    <ThemeProvider>
      <Component {...pageProps} />
    </ThemeProvider>
  );
}
