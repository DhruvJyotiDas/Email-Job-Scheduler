import { z } from 'zod';

export const EMAIL_STATUSES = ['scheduled', 'sending', 'sent', 'failed', 'delayed_ratelimit', 'suppressed'] as const;
export type EmailStatus = (typeof EMAIL_STATUSES)[number];

export const recipientSchema = z.object({
  email: z.string().email(),
  variables: z.record(z.string()).optional(),
});

export const createCampaignSchema = z.object({
  name: z.string().min(1).max(120).optional(),
  senderId: z.string().optional(), // omitted => rotate across all active senders
  recipients: z.array(recipientSchema).min(1).max(20000),
  subject: z.string().min(1).max(300),
  body: z.string().min(1),
  startAt: z.string().datetime(), // ISO UTC
  delayMs: z.number().int().min(0).max(3_600_000).default(2000),
  hourlyLimit: z.number().int().min(1).max(100000).default(200),
});
export type CreateCampaignInput = z.infer<typeof createCampaignSchema>;

export interface SendEmailJobData {
  emailId: string;
}

export const QUEUE_NAME = 'email-send';
export const SOCKET_EVENT_EMAIL = 'email:update';

export interface EmailUpdateEvent {
  emailId: string;
  status: EmailStatus;
  recipient: string;
  senderEmail?: string | null;
  scheduledAt: string;
  sentAt?: string | null;
}
