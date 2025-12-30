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

export interface PaginationInfo {
  page: number;
  limit: number;
  total: number;
  pages: number;
}

export interface EmailListResponse {
  emails: Email[];
  pagination: PaginationInfo;
}

export interface EmailDetailResponse {
  email: Email;
  attachments: Attachment[];
  audit_logs: AuditLog[];
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
  // Email credentials (password is never returned to client)
  email_address: string | null;
  email_provider: 'gmail' | 'outlook' | null;
  email_credentials_verified: boolean;
  email_credentials_verified_at: string | null;
  created_at: string;
  updated_at: string;
}

export type EmailTypeFilter = 'all' | 'inquiry' | 'complaint' | 'support' | 'billing' | 'other';

export interface SettingsResponse {
  settings: ClientSettings | null;
}

export interface IngestResponse {
  success: boolean;
  triggered: boolean;
  sinceDays: number;
  message: string;
}
