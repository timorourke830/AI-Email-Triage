-- AI Email Triage System - Supabase Schema
-- Run this in your Supabase SQL Editor

-- Enable UUID extension
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- Clients table
CREATE TABLE clients (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    name VARCHAR(255) NOT NULL,
    email VARCHAR(255) NOT NULL UNIQUE,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Client settings table
CREATE TABLE client_settings (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    client_id UUID NOT NULL REFERENCES clients(id) ON DELETE CASCADE,
    auto_approve_threshold DECIMAL(3,2) DEFAULT 0.95,
    reply_tone VARCHAR(20) DEFAULT 'neutral' CHECK (reply_tone IN ('formal', 'friendly', 'neutral')),
    signature TEXT DEFAULT '',
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW(),
    UNIQUE(client_id)
);

-- Email status enum
CREATE TYPE email_status AS ENUM (
    'pending',
    'processing',
    'awaiting_approval',
    'sent',
    'rejected'
);

-- Email classification enum
CREATE TYPE email_classification AS ENUM (
    'inquiry',
    'complaint',
    'support',
    'billing',
    'spam',
    'other'
);

-- Emails table
CREATE TABLE emails (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    client_id UUID NOT NULL REFERENCES clients(id) ON DELETE CASCADE,
    external_id VARCHAR(255),
    from_address VARCHAR(255) NOT NULL,
    to_address VARCHAR(255) NOT NULL,
    subject TEXT NOT NULL,
    body TEXT NOT NULL,
    status email_status DEFAULT 'pending',
    classification email_classification,
    classification_confidence DECIMAL(3,2),
    extracted_data JSONB,
    draft_reply TEXT,
    final_reply TEXT,
    processed_at TIMESTAMPTZ,
    sent_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Attachments table
CREATE TABLE attachments (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    email_id UUID NOT NULL REFERENCES emails(id) ON DELETE CASCADE,
    filename VARCHAR(255) NOT NULL,
    content_type VARCHAR(100) NOT NULL,
    storage_path TEXT NOT NULL,
    extracted_text TEXT,
    extracted_data JSONB,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Audit logs table
CREATE TABLE audit_logs (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    email_id UUID NOT NULL REFERENCES emails(id) ON DELETE CASCADE,
    action VARCHAR(100) NOT NULL,
    actor VARCHAR(255) NOT NULL,
    details JSONB,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Indexes for performance
CREATE INDEX idx_emails_status ON emails(status);
CREATE INDEX idx_emails_client_id ON emails(client_id);
CREATE INDEX idx_emails_created_at ON emails(created_at DESC);
CREATE INDEX idx_emails_classification ON emails(classification);
CREATE INDEX idx_attachments_email_id ON attachments(email_id);
CREATE INDEX idx_audit_logs_email_id ON audit_logs(email_id);
CREATE INDEX idx_audit_logs_created_at ON audit_logs(created_at);

-- Updated_at trigger function
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ language 'plpgsql';

-- Apply updated_at triggers
CREATE TRIGGER update_clients_updated_at
    BEFORE UPDATE ON clients
    FOR EACH ROW
    EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_client_settings_updated_at
    BEFORE UPDATE ON client_settings
    FOR EACH ROW
    EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_emails_updated_at
    BEFORE UPDATE ON emails
    FOR EACH ROW
    EXECUTE FUNCTION update_updated_at_column();

-- Row Level Security (RLS) policies
-- Enable RLS
ALTER TABLE clients ENABLE ROW LEVEL SECURITY;
ALTER TABLE client_settings ENABLE ROW LEVEL SECURITY;
ALTER TABLE emails ENABLE ROW LEVEL SECURITY;
ALTER TABLE attachments ENABLE ROW LEVEL SECURITY;
ALTER TABLE audit_logs ENABLE ROW LEVEL SECURITY;

-- Service role bypass (for backend)
CREATE POLICY "Service role has full access to clients"
    ON clients FOR ALL
    USING (auth.role() = 'service_role');

CREATE POLICY "Service role has full access to client_settings"
    ON client_settings FOR ALL
    USING (auth.role() = 'service_role');

CREATE POLICY "Service role has full access to emails"
    ON emails FOR ALL
    USING (auth.role() = 'service_role');

CREATE POLICY "Service role has full access to attachments"
    ON attachments FOR ALL
    USING (auth.role() = 'service_role');

CREATE POLICY "Service role has full access to audit_logs"
    ON audit_logs FOR ALL
    USING (auth.role() = 'service_role');

-- Create storage bucket for attachments
INSERT INTO storage.buckets (id, name, public)
VALUES ('attachments', 'attachments', false)
ON CONFLICT (id) DO NOTHING;

-- Storage policy for service role
CREATE POLICY "Service role can manage attachments"
    ON storage.objects FOR ALL
    USING (bucket_id = 'attachments' AND auth.role() = 'service_role');

-- Sample data for testing (optional)
-- INSERT INTO clients (name, email) VALUES ('Test Company', 'test@example.com');
