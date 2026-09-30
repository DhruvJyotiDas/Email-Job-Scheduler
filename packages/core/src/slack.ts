import { prisma } from './db';
import { decrypt } from './crypto';
import { logger } from './logger';

/** Post a message to the user's connected Slack channel. No-op (returns false) if not connected. */
export async function postSlack(userId: string, text: string): Promise<boolean> {
  const conn = await prisma.slackConnection.findUnique({ where: { userId } });
  if (!conn) return false;
  try {
    const res = await fetch('https://slack.com/api/chat.postMessage', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${decrypt(conn.accessTokenEnc)}` },
      body: JSON.stringify({ channel: conn.channel, text }),
    });
    const json = (await res.json()) as { ok: boolean; error?: string };
    if (!json.ok) logger.warn({ error: json.error }, 'slack post failed');
    return json.ok;
  } catch (err) {
    logger.warn({ err }, 'slack post error');
    return false;
  }
}

/** Alert once per sender per hour window (the DB unique constraint is the dedupe). */
export async function alertRateLimitOnce(userId: string, senderId: string, senderEmail: string, hourWindow: string) {
  try {
    await prisma.rateLimitAlert.create({ data: { senderId, hourWindow } });
  } catch (e: any) {
    if (e?.code === 'P2002') return;
    throw e;
  }
  await postSlack(
    userId,
    `:warning: Sender *${senderEmail}* hit its hourly send limit (window ${hourWindow}Z). Remaining emails were rescheduled to the next hour, none dropped.`,
  );
}
