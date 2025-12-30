export type EmailStatus =
  | 'pending'
  | 'processing'
  | 'awaiting_approval'
  | 'sent'
  | 'rejected';

export type EmailClassification =
  | 'inquiry'
  | 'complaint'
  | 'support'
  | 'billing'
  | 'spam'
  | 'other';

export interface Client {
  id: string;
  name: string;
  email: string;
  created_at: string;
  updated_at: string;
}

export interface ClientSettings {
  id: string;
  client_id: string;
  auto_approve_threshold: number;
  reply_tone: 'formal' | 'friendly' | 'neutral';
  signature: string;
  ingest_since_days: number;
  email_types_filter: string[];
  setup_completed: boolean;
  setup_completed_at: string | null;
  created_at: string;
  updated_at: string;
}

export interface Email {
  id: string;
  client_id: string;
  external_id: string | null;
  from_address: string;
  to_address: string;
  subject: string;
  body: string;
  status: EmailStatus;
  classification: EmailClassification | null;
  classification_confidence: number | null;
  extracted_data: Record<string, unknown> | null;
  draft_reply: string | null;
  final_reply: string | null;
  processed_at: string | null;
  sent_at: string | null;
  created_at: string;
  updated_at: string;
}

export interface Attachment {
  id: string;
  email_id: string;
  filename: string;
  content_type: string;
  storage_path: string;
  extracted_text: string | null;
  extracted_data: Record<string, unknown> | null;
  created_at: string;
}

export interface AuditLog {
  id: string;
  email_id: string;
  action: string;
  actor: string;
  details: Record<string, unknown> | null;
  created_at: string;
}

export interface Database {
  clients: Client;
  client_settings: ClientSettings;
  emails: Email;
  attachments: Attachment;
  audit_logs: AuditLog;
}
