import { createHash } from 'crypto';

export function idempotencyKey(campaignId: string, recipient: string, step = 0): string {
  return createHash('sha256').update(`${campaignId}|${recipient.toLowerCase()}|${step}`).digest('hex');
}
