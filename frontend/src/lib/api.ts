export class ApiError extends Error {
  constructor(public status: number, message: string) {
    super(message);
  }
}

export async function api<T = any>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(path, {
    credentials: 'include',
    headers: init?.body ? { 'Content-Type': 'application/json' } : undefined,
    ...init,
  });
  if (!res.ok) {
    const j = await res.json().catch(() => ({}));
    const msg = j.issues?.[0] ? `${j.issues[0].path.join('.')}: ${j.issues[0].message}` : (j.error ?? res.statusText);
    throw new ApiError(res.status, msg);
  }
  return res.status === 204 ? (undefined as T) : res.json();
}

export interface EmailRow {
  id: string;
  recipient: string;
  subject: string;
  preview: string;
  status: 'scheduled' | 'sending' | 'sent' | 'failed' | 'delayed_ratelimit' | 'suppressed';
  scheduledAt: string;
  sentAt: string | null;
  senderEmail: string | null;
  starred: boolean;
  error?: string | null;
  highlight?: { subject?: string[]; body?: string[]; recipient?: string[] };
}

export interface Me {
  id: string;
  name: string;
  email: string;
  avatarUrl: string | null;
  slackConnected: boolean;
}

export interface SenderRow {
  id: string;
  email: string;
  hourlyLimit: number;
  isActive: boolean;
  usedThisHour: number;
}
