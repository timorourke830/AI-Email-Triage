-- Add setup-related columns to client_settings
-- Run this migration against your Supabase database

ALTER TABLE client_settings
ADD COLUMN IF NOT EXISTS ingest_since_days INTEGER DEFAULT 7,
ADD COLUMN IF NOT EXISTS email_types_filter JSONB DEFAULT '["all"]'::jsonb,
ADD COLUMN IF NOT EXISTS setup_completed BOOLEAN DEFAULT false,
ADD COLUMN IF NOT EXISTS setup_completed_at TIMESTAMPTZ;

-- Add index for quick lookup of setup status
CREATE INDEX IF NOT EXISTS idx_client_settings_setup_completed
ON client_settings(setup_completed);

-- Update existing rows to have setup_completed = true (they were set up before this feature)
UPDATE client_settings SET setup_completed = true WHERE setup_completed IS NULL;
