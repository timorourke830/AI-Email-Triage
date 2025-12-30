-- Migration: Add Microsoft OAuth2 support for Outlook/Hotmail
-- Microsoft has deprecated basic auth (IMAP/SMTP), so we use Graph API with OAuth2

-- =============================================================================
-- Add Microsoft OAuth columns to client_settings
-- =============================================================================

ALTER TABLE client_settings
ADD COLUMN IF NOT EXISTS microsoft_client_id TEXT,
ADD COLUMN IF NOT EXISTS microsoft_client_secret_encrypted TEXT,
ADD COLUMN IF NOT EXISTS microsoft_access_token_encrypted TEXT,
ADD COLUMN IF NOT EXISTS microsoft_refresh_token_encrypted TEXT,
ADD COLUMN IF NOT EXISTS microsoft_token_expires TIMESTAMPTZ;

-- Add index for quick lookup of clients with Microsoft OAuth
CREATE INDEX IF NOT EXISTS idx_client_settings_microsoft_oauth
ON client_settings(client_id) WHERE microsoft_refresh_token_encrypted IS NOT NULL;

-- =============================================================================
-- Note: For Outlook accounts:
-- - email_provider = 'outlook'
-- - microsoft_access_token_encrypted and microsoft_refresh_token_encrypted are used
-- - email_password_encrypted is NOT used (OAuth replaces app passwords)
--
-- For Gmail accounts:
-- - email_provider = 'gmail'
-- - email_password_encrypted is used (app password)
-- - Microsoft OAuth columns remain NULL
-- =============================================================================
