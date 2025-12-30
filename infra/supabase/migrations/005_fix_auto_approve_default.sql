-- Migration: Fix auto_approve_threshold default to require manual approval
--
-- The previous default of 0.95 meant new users would auto-send replies
-- without explicit consent. This changes the default to 0 (manual approval required).

-- Change the default for new client_settings rows
ALTER TABLE client_settings
ALTER COLUMN auto_approve_threshold SET DEFAULT 0;

-- Note: We don't update existing rows because users may have intentionally
-- chosen their current setting. The fix in process.ts now correctly handles
-- the 0 value to mean "never auto-approve".
