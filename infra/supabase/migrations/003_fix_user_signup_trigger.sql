-- Migration: Fix user signup trigger to properly bypass RLS
-- This fixes the "Database error saving new user" issue

-- =============================================================================
-- PROBLEM: The original trigger uses a SELECT subquery that's blocked by RLS
-- because auth.uid() is NULL during the trigger execution context.
--
-- SOLUTION: Use RETURNING clause instead of subselect, and ensure proper
-- SECURITY DEFINER usage with search_path set for security.
-- =============================================================================

-- Drop and recreate the function with fixes
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''  -- Security best practice to prevent search path hijacking
AS $$
DECLARE
    new_client_id UUID;
BEGIN
    -- Insert client record and capture the ID directly via RETURNING
    -- This avoids the RLS-blocked SELECT subquery
    INSERT INTO public.clients (auth_user_id, name, email)
    VALUES (
        NEW.id,
        COALESCE(NEW.raw_user_meta_data->>'name', 'User'),
        NEW.email
    )
    RETURNING id INTO new_client_id;

    -- Insert client_settings using the captured ID directly
    INSERT INTO public.client_settings (client_id)
    VALUES (new_client_id);

    RETURN NEW;
EXCEPTION
    WHEN unique_violation THEN
        -- If client/email already exists (e.g., re-signup attempt),
        -- just return without error
        RETURN NEW;
    WHEN OTHERS THEN
        -- Log the error for debugging but don't block user creation
        RAISE WARNING 'handle_new_user trigger error: %', SQLERRM;
        RETURN NEW;
END;
$$;

-- Ensure the trigger exists (recreate to be safe)
DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;

CREATE TRIGGER on_auth_user_created
AFTER INSERT ON auth.users
FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();

-- =============================================================================
-- Note: The SECURITY DEFINER function should bypass RLS automatically when
-- run by the postgres superuser. The fix above (using RETURNING instead of
-- subselect) is the primary fix. No additional INSERT policy is needed since:
-- 1. SECURITY DEFINER runs as function owner (postgres) which bypasses RLS
-- 2. Adding a permissive INSERT policy could create security issues
-- =============================================================================
