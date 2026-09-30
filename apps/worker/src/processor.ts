import { DelayedError, Job } from 'bullmq';
import {
  prisma, redis, config, logger, reserveSend, releaseSend, indexEmail, alertRateLimitOnce, EVENTS_CHANNEL,
} from '@ejs/core';
import { EmailUpdateEvent, SendEmailJobData, hourWindowLabel, renderTemplate } from '@ejs/shared';
import { sendMail } from './mailer';

/** A 'sending' row older than this is treated as abandoned by a crashed worker and may be retaken. */
const STALE_LOCK_MS = 60_000;
const MAX_ATTEMPTS = 3;

async function publish(emailId: string) {
  const e = await prisma.email.findUnique({ where: { id: emailId }, include: { sender: true } });
  if (!e) return;
  const ev: EmailUpdateEvent = {
    emailId: e.id,
    status: e.status,
    recipient: e.recipient,
    senderEmail: e.sender?.email,
    scheduledAt: e.scheduledAt.toISOString(),
    sentAt: e.sentAt?.toISOString() ?? null,
  };
  await redis.publish(EVENTS_CHANNEL, JSON.stringify({ userId: (await prisma.campaign.findUnique({ where: { id: e.campaignId } }))?.userId, ev }));
}

async function setStatus(emailId: string, data: Parameters<typeof prisma.email.update>[0]['data']) {
  await prisma.email.update({ where: { id: emailId }, data });
  void indexEmail(emailId); // best-effort; Postgres is the source of truth
  await publish(emailId);
}

export async function processEmail(job: Job<SendEmailJobData>, token?: string): Promise<void> {
  const log = logger.child({ jobId: job.id, emailId: job.data.emailId, requestId: job.data.requestId });
  const email = await prisma.email.findUnique({ where: { id: job.data.emailId }, include: { campaign: true } });
  if (!email) return log.warn('email row missing, dropping job');

  // Idempotency layer 3a: terminal states are never re-sent.
  if (['sent', 'failed', 'suppressed'].includes(email.status)) return log.info({ status: email.status }, 'already terminal, skipping');

  // Suppression list: opted-out recipients are skipped at send time.
  const suppressed = await prisma.suppression.findUnique({
    where: { userId_email: { userId: email.campaign.userId, email: email.recipient.toLowerCase() } },
  });
  if (suppressed) {
    await setStatus(email.id, { status: 'suppressed' });
    return log.info('recipient suppressed');
  }

  // Candidate senders: the pinned one, or all active senders (least recently used first = rotation).
  const senders = await prisma.sender.findMany({
    where: { userId: email.campaign.userId, isActive: true, ...(email.senderId ? { id: email.senderId } : {}) },
    orderBy: [{ lastUsedAt: { sort: 'asc', nulls: 'first' } }],
  });
  if (!senders.length) throw new Error('No active sender available');

  let chosen: (typeof senders)[number] | null = null;
  let gapRetryAt = Infinity;
  const now = Date.now();
  for (const s of senders) {
    const limit = Math.min(s.hourlyLimit, email.campaign.hourlyLimit);
    const r = await reserveSend(redis, s.id, limit, email.campaign.delayMs || config.minDelayBetweenSendsMs, now);
    if (r.ok) { chosen = s; break; }
    if (r.reason === 'gap') gapRetryAt = Math.min(gapRetryAt, r.retryAt);
    else await alertRateLimitOnce(email.campaign.userId, s.id, s.email, hourWindowLabel(now));
  }

  if (!chosen) {
    // Either every sender is inside its min-gap (short wait) or every sender is capped (next hour window).
    const nextWindow = Math.ceil((now + 1) / 3_600_000) * 3_600_000;
    const retryAt = gapRetryAt !== Infinity ? gapRetryAt : nextWindow + Math.floor(Math.random() * 1000);
    if (gapRetryAt === Infinity) await setStatus(email.id, { status: 'delayed_ratelimit', scheduledAt: new Date(retryAt) });
    log.info({ retryAt: new Date(retryAt).toISOString() }, 'rescheduling (rate limit / gap), not dropping');
    await job.moveToDelayed(retryAt, token);
    throw new DelayedError();
  }

  // Idempotency layer 3b: compare-and-swap so only one worker owns the send.
  const staleBefore = new Date(Date.now() - STALE_LOCK_MS);
  const cas = await prisma.email.updateMany({
    where: {
      id: email.id,
      OR: [{ status: { in: ['scheduled', 'delayed_ratelimit'] } }, { status: 'sending', lockedAt: { lt: staleBefore } }],
    },
    data: { status: 'sending', senderId: chosen.id, lockedAt: new Date() },
  });
  if (cas.count === 0) {
    await releaseSend(redis, chosen.id);
    return log.info('lost CAS race, another worker owns this email');
  }
  void indexEmail(email.id);
  await publish(email.id);

  try {
    const vars = (email.variables ?? {}) as Record<string, string>;
    const subject = renderTemplate(email.campaign.subject, vars);
    const html = renderTemplate(email.campaign.bodyTemplate, vars);
    const { previewUrl } = await sendMail({ sender: chosen, to: email.recipient, subject, html });
    await prisma.sender.update({ where: { id: chosen.id }, data: { lastUsedAt: new Date() } });
    await setStatus(email.id, {
      status: 'sent', sentAt: new Date(), subjectRendered: subject, bodyRendered: html, previewUrl, error: null,
    });
    log.info({ sender: chosen.email }, 'email sent');
  } catch (err: any) {
    const final = job.attemptsMade + 1 >= (job.opts.attempts ?? MAX_ATTEMPTS);
    await releaseSend(redis, chosen.id);
    await setStatus(email.id, { status: final ? 'failed' : 'scheduled', error: String(err?.message ?? err), lockedAt: null });
    log.error({ err }, 'send failed');
    throw err; // let BullMQ apply retry/backoff
  }
}
