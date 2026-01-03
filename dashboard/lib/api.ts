import type {
  EmailListResponse,
  EmailDetailResponse,
  EmailStatus,
  SettingsResponse,
  IngestResponse,
  ClientSettings,
} from './types';

const API_BASE = process.env.NEXT_PUBLIC_API_URL || '';

interface FetchOptions {
  method?: 'GET' | 'POST' | 'PUT' | 'DELETE';
  body?: unknown;
}

async function apiFetch<T>(endpoint: string, options: FetchOptions = {}): Promise<T> {
  const { method = 'GET', body } = options;

  const res = await fetch(`${API_BASE}${endpoint}`, {
    method,
    headers: {
      'Content-Type': 'application/json',
    },
    body: body ? JSON.stringify(body) : undefined,
  });

  if (!res.ok) {
    const error = await res.json().catch(() => ({ error: 'Request failed' }));
    throw new Error(error.error || `HTTP ${res.status}`);
  }

  return res.json();
}

export async function getEmails(params?: {
  status?: EmailStatus;
  client_id?: string;
  page?: number;
  limit?: number;
}): Promise<EmailListResponse> {
  const searchParams = new URLSearchParams();

  if (params?.status) searchParams.set('status', params.status);
  if (params?.client_id) searchParams.set('client_id', params.client_id);
  if (params?.page) searchParams.set('page', params.page.toString());
  if (params?.limit) searchParams.set('limit', params.limit.toString());

  const query = searchParams.toString();
  return apiFetch<EmailListResponse>(`/api/emails${query ? `?${query}` : ''}`);
}

export async function getEmail(id: string): Promise<EmailDetailResponse> {
  return apiFetch<EmailDetailResponse>(`/api/emails/${id}`);
}

export async function approveEmail(
  id: string,
  editedReply?: string
): Promise<{ success: boolean; status: string }> {
  return apiFetch(`/api/emails/${id}/approve`, {
    method: 'POST',
    body: { edited_reply: editedReply },
  });
}

export async function rejectEmail(
  id: string,
  reason?: string
): Promise<{ success: boolean; status: string }> {
  return apiFetch(`/api/emails/${id}/reject`, {
    method: 'POST',
    body: { reason },
  });
}

// Settings API
export async function getSettings(): Promise<SettingsResponse> {
  return apiFetch<SettingsResponse>('/api/settings');
}

export async function updateSettings(
  settings: Partial<ClientSettings>
): Promise<SettingsResponse> {
  return apiFetch<SettingsResponse>('/api/settings', {
    method: 'PUT',
    body: settings,
  });
}

export async function completeSetup(): Promise<{ success: boolean }> {
  return apiFetch('/api/setup/complete', { method: 'POST' });
}

export async function triggerIngest(): Promise<IngestResponse> {
  return apiFetch<IngestResponse>('/api/ingest', { method: 'POST' });
}

export interface ProcessResponse {
  success: boolean;
  processed: number;
  errors: number;
  details?: Array<{
    email_id: string;
    classification: string | null;
    status: string;
    error?: string;
  }>;
}

export async function processEmails(limit?: number): Promise<ProcessResponse> {
  return apiFetch<ProcessResponse>('/api/emails/process', {
    method: 'POST',
    body: { limit: limit || 10 },
  });
}
