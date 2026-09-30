import { Router } from 'express';
import { createHash } from 'crypto';
import { createCampaignSchema, idempotencyKey } from '@ejs/shared';
import { emailQueue, indexEmail, prisma } from '@ejs/core';
import { uid } from '../auth';

export const campaignsRouter = Router();

/**
 * Campaign ids are a hash of the request content, so re-submitting the same CSV/subject/body/time
 * resolves to the same campaign and therefore the same idempotency keys + BullMQ jobIds (no double sends).
 */
const campaignIdFor = (userId: string, b: ReturnType<typeof createCampaignSchema.parse>) =>
  'c' + createHash('sha256')
    .update(JSON.stringify([userId, b.subject, b.body, b.startAt, b.senderId ?? '', b.recipients.map((r) => r.email.toLowerCase()).sort()]))
    .digest('hex')
    .slice(0, 24);

campaignsRouter.post('/', async (req, res) => {
  const userId = uid(req);
  const body = createCampaignSchema.parse(req.body);
  const id = campaignIdFor(userId, body);

  const existing = await prisma.campaign.findUnique({ where: { id }, include: { _count: { select: { emails: true } } } });
  if (existing) return void res.status(200).json({ id, total: existing._count.emails, duplicate: true });

  const startAt = new Date(body.startAt);
  // De-dupe recipients inside the request too.
  const seen = new Set<string>();
  const recipients = body.recipients.filter((r) => {
    const k = r.email.toLowerCase();
    return seen.has(k) ? false : (seen.add(k), true);
  });

  const rows = recipients.map((r, i) => ({
    campaignId: id,
    senderId: body.senderId ?? null,
    recipient: r.email.toLowerCase(),
    variables: r.variables ?? {},
    step: 0,
    scheduledAt: new Date(startAt.getTime() + i * body.delayMs),
    idempotencyKey: idempotencyKey(id, r.email, 0),
  }));

  await prisma.$transaction([
    prisma.campaign.create({
      data: {
        id, userId, name: body.name ?? body.subject, subject: body.subject, bodyTemplate: body.body,
        startAt, delayMs: body.delayMs, hourlyLimit: body.hourlyLimit,
      },
    }),
    prisma.email.createMany({ data: rows }),
  ]);

  const created = await prisma.email.findMany({ where: { campaignId: id }, select: { id: true, idempotencyKey: true, scheduledAt: true } });
  await emailQueue.addBulk(
    created.map((e) => ({
      name: 'send-email',
      data: { emailId: e.id },
      opts: { jobId: e.idempotencyKey, delay: Math.max(0, e.scheduledAt.getTime() - Date.now()) },
    })),
  );
  void Promise.all(created.map((e) => indexEmail(e.id)));

  res.status(201).json({ id, total: created.length, duplicate: false });
});

campaignsRouter.get('/:id', async (req, res) => {
  const userId = uid(req);
  const c = await prisma.campaign.findFirst({ where: { id: String(req.params.id), userId } });
  if (!c) return void res.status(404).json({ error: 'not found' });
  const groups = await prisma.email.groupBy({ by: ['status'], where: { campaignId: c.id }, _count: true });
  res.json({ ...c, counts: Object.fromEntries(groups.map((g) => [g.status, g._count])) });
});
