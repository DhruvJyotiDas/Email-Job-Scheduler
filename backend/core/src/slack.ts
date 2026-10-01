import { prisma } from './db';
import { decrypt } from './crypto';
import { logger } from './logger';

export interface SlackResult {
  ok: boolean;
  error?: string;
}

/** Post a message to the user's connected Slack channel. Never throws; `error` is Slack's reason (e.g. channel_not_found). */
export async function postSlackResult(userId: string, text: string): Promise<SlackResult> {
  const conn = await prisma.slackConnection.findUnique({ where: { userId } });
  if (!conn) return { ok: false, error: 'not_connected' };
  try {
    const res = await fetch('https://slack.com/api/chat.postMessage', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${decrypt(conn.accessTokenEnc)}` },
      body: JSON.stringify({ channel: conn.channel, text }),
    });
    const json = (await res.json()) as { ok: boolean; error?: string };
    if (!json.ok) logger.warn({ error: json.error, channel: conn.channel }, 'slack post failed');
    return { ok: json.ok, error: json.error };
  } catch (err) {
    logger.warn({ err }, 'slack post error');
    return { ok: false, error: (err as Error).message };
  }
}

/** Post a message to the user's connected Slack channel. No-op (returns false) if not connected. */
export async function postSlack(userId: string, text: string): Promise<boolean> {
  return (await postSlackResult(userId, text)).ok;
}

/** Alert once per sender per hour window (the DB unique constraint is the dedupe). */
export async function alertRateLimitOnce(userId: string, senderId: string, senderEmail: string, hourWindow: string) {
  try {
    await prisma.rateLimitAlert.create({ data: { senderId, hourWindow } });
  } catch (e: any) {
    if (e?.code === 'P2002') return;
    throw e;
  }
  const sent = await postSlack(
    userId,
    `:warning: Sender *${senderEmail}* hit its hourly send limit (window ${hourWindow}Z). Remaining emails were rescheduled to the next hour, none dropped.`,
  );
  // Not delivered (Slack not connected yet, or a Slack error): free the dedupe slot so the next hit retries,
  // which also makes alerts start working as soon as Slack is connected, without a redeploy.
  if (!sent) await prisma.rateLimitAlert.deleteMany({ where: { senderId, hourWindow } });
}
