-- Migration: Add authentication support and email credentials
-- This migration links clients to Supabase auth.users and adds encrypted email credential storage

-- =============================================================================
-- STEP 1: Add auth_user_id to clients table
-- =============================================================================

ALTER TABLE clients
ADD COLUMN IF NOT EXISTS auth_user_id UUID UNIQUE REFERENCES auth.users(id) ON DELETE CASCADE;

CREATE INDEX IF NOT EXISTS idx_clients_auth_user_id ON clients(auth_user_id);

-- =============================================================================
-- STEP 2: Add email credential columns to client_settings
-- =============================================================================

ALTER TABLE client_settings
ADD COLUMN IF NOT EXISTS email_address VARCHAR(255),
ADD COLUMN IF NOT EXISTS email_password_encrypted TEXT,
ADD COLUMN IF NOT EXISTS email_provider VARCHAR(20) DEFAULT 'gmail',
ADD COLUMN IF NOT EXISTS email_credentials_verified BOOLEAN DEFAULT false,
ADD COLUMN IF NOT EXISTS email_credentials_verified_at TIMESTAMPTZ;

-- =============================================================================
-- STEP 3: Create trigger to auto-create client + settings on user signup
-- =============================================================================

CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER AS $$
BEGIN
    -- Create a client record for the new user
    INSERT INTO public.clients (auth_user_id, name, email)
    VALUES (
        NEW.id,
        COALESCE(NEW.raw_user_meta_data->>'name', 'User'),
        NEW.email
    );

    -- Create client_settings for the new client
    INSERT INTO public.client_settings (client_id)
    SELECT id FROM public.clients WHERE auth_user_id = NEW.id;

    RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Drop existing trigger if it exists
DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;

-- Create trigger on auth.users table
CREATE TRIGGER on_auth_user_created
AFTER INSERT ON auth.users
FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();

-- =============================================================================
-- STEP 4: Update RLS policies for user-specific access
-- =============================================================================

-- Drop existing service-role-only policies
DROP POLICY IF EXISTS "Service role has full access to clients" ON clients;
DROP POLICY IF EXISTS "Service role has full access to client_settings" ON client_settings;
DROP POLICY IF EXISTS "Service role has full access to emails" ON emails;
DROP POLICY IF EXISTS "Service role has full access to attachments" ON attachments;
DROP POLICY IF EXISTS "Service role has full access to audit_logs" ON audit_logs;

-- -----------------------------------------------------------------------------
-- Clients table policies
-- -----------------------------------------------------------------------------

CREATE POLICY "Users can view own client" ON clients
FOR SELECT USING (auth.uid() = auth_user_id);

CREATE POLICY "Users can update own client" ON clients
FOR UPDATE USING (auth.uid() = auth_user_id);

CREATE POLICY "Service role full access to clients" ON clients
FOR ALL USING (auth.role() = 'service_role');

-- -----------------------------------------------------------------------------
-- Client settings policies
-- -----------------------------------------------------------------------------

CREATE POLICY "Users can view own settings" ON client_settings
FOR SELECT USING (
    client_id IN (SELECT id FROM clients WHERE auth_user_id = auth.uid())
);

CREATE POLICY "Users can update own settings" ON client_settings
FOR UPDATE USING (
    client_id IN (SELECT id FROM clients WHERE auth_user_id = auth.uid())
);

CREATE POLICY "Users can insert own settings" ON client_settings
FOR INSERT WITH CHECK (
    client_id IN (SELECT id FROM clients WHERE auth_user_id = auth.uid())
);

CREATE POLICY "Service role full access to client_settings" ON client_settings
FOR ALL USING (auth.role() = 'service_role');

-- -----------------------------------------------------------------------------
-- Emails table policies
-- -----------------------------------------------------------------------------

CREATE POLICY "Users can view own emails" ON emails
FOR SELECT USING (
    client_id IN (SELECT id FROM clients WHERE auth_user_id = auth.uid())
);

CREATE POLICY "Users can update own emails" ON emails
FOR UPDATE USING (
    client_id IN (SELECT id FROM clients WHERE auth_user_id = auth.uid())
);

CREATE POLICY "Users can insert own emails" ON emails
FOR INSERT WITH CHECK (
    client_id IN (SELECT id FROM clients WHERE auth_user_id = auth.uid())
);

CREATE POLICY "Service role full access to emails" ON emails
FOR ALL USING (auth.role() = 'service_role');

-- -----------------------------------------------------------------------------
-- Attachments table policies
-- -----------------------------------------------------------------------------

CREATE POLICY "Users can view own attachments" ON attachments
FOR SELECT USING (
    email_id IN (
        SELECT e.id FROM emails e
        JOIN clients c ON e.client_id = c.id
        WHERE c.auth_user_id = auth.uid()
    )
);

CREATE POLICY "Service role full access to attachments" ON attachments
FOR ALL USING (auth.role() = 'service_role');

-- -----------------------------------------------------------------------------
-- Audit logs policies
-- -----------------------------------------------------------------------------

CREATE POLICY "Users can view own audit_logs" ON audit_logs
FOR SELECT USING (
    email_id IN (
        SELECT e.id FROM emails e
        JOIN clients c ON e.client_id = c.id
        WHERE c.auth_user_id = auth.uid()
    )
);

CREATE POLICY "Users can insert own audit_logs" ON audit_logs
FOR INSERT WITH CHECK (
    email_id IN (
        SELECT e.id FROM emails e
        JOIN clients c ON e.client_id = c.id
        WHERE c.auth_user_id = auth.uid()
    )
);

CREATE POLICY "Service role full access to audit_logs" ON audit_logs
FOR ALL USING (auth.role() = 'service_role');
