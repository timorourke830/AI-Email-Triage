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

function ErrorScreen({ message }: { message: string }) {
  return (
    <div className="min-h-screen flex items-center justify-center bg-slate-50 dark:bg-slate-900">
      <div className="flex flex-col items-center gap-4 max-w-md text-center px-4">
        <div className="w-10 h-10 rounded-lg bg-red-600 flex items-center justify-center">
          <svg className="w-5 h-5 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
          </svg>
        </div>
        <p className="text-sm text-red-600 dark:text-red-400">{message}</p>
        <button
          onClick={() => window.location.reload()}
          className="text-sm text-primary-600 hover:text-primary-700 dark:text-primary-400 underline"
        >
          Try again
        </button>
      </div>
    </div>
  );
}

export default function App({ Component, pageProps }: AppProps) {
  const router = useRouter();
  const [checking, setChecking] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [isAuthenticated, setIsAuthenticated] = useState(false);

  useEffect(() => {
    let supabase: ReturnType<typeof getSupabaseBrowserClient>;

    try {
      console.log('[App] Initializing Supabase client...');
      supabase = getSupabaseBrowserClient();
      console.log('[App] Supabase client initialized');
    } catch (err) {
      console.error('[App] Failed to initialize Supabase client:', err);
      setError('Configuration error. Please contact support.');
      setChecking(false);
      return;
    }

    async function checkAuth() {
      const isOnAuthRoute = AUTH_ROUTES.includes(router.pathname);
      console.log('[App] Checking auth, pathname:', router.pathname, 'isAuthRoute:', isOnAuthRoute);

      try {
        console.log('[App] Calling getSession...');
        const { data: { session }, error: sessionError } = await supabase.auth.getSession();
        console.log('[App] getSession result:', {
          hasSession: !!session,
          hasError: !!sessionError,
          errorMessage: sessionError?.message,
        });

        if (sessionError) {
          console.error('Session error:', sessionError);
          // On auth routes, allow access even if session check fails
          if (isOnAuthRoute) {
            setChecking(false);
            return;
          }
          // For protected routes, redirect to sign in
          router.replace('/auth/signin');
          return;
        }

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
      } catch (err) {
        console.error('Auth check failed:', err);
        // On auth routes, allow access even if auth check fails
        if (isOnAuthRoute) {
          setChecking(false);
          return;
        }
        // For protected routes, show error or redirect
        setError('Unable to verify authentication. Please try again.');
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

  // Show error state
  if (error) {
    return (
      <ThemeProvider>
        <ErrorScreen message={error} />
      </ThemeProvider>
    );
  }

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
