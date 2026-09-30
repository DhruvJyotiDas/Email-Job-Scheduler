import { Router } from 'express';
import type { Sender } from '@prisma/client';
import { currentUsage, emailQueue, prisma, redis } from '@ejs/core';
import { uid } from '../auth';

export const statsRouter = Router();

/** Analytics: queue depth, status breakdown, last-24h hourly throughput, per-sender usage. */
statsRouter.get('/', async (req, res) => {
  const userId = uid(req);
  const since = new Date(Date.now() - 24 * 3600_000);

  const [queue, groups, sentRows, senders] = await Promise.all([
    emailQueue.getJobCounts('waiting', 'active', 'delayed', 'completed', 'failed'),
    prisma.email.groupBy({ by: ['status'], where: { campaign: { userId } }, _count: true }),
    prisma.email.findMany({ where: { campaign: { userId }, status: 'sent', sentAt: { gte: since } }, select: { sentAt: true } }),
    prisma.sender.findMany({ where: { userId } }),
  ]);

  const buckets = new Map<string, number>();
  for (let i = 23; i >= 0; i--) buckets.set(new Date(Date.now() - i * 3600_000).toISOString().slice(0, 13), 0);
  for (const r of sentRows) {
    const k = r.sentAt!.toISOString().slice(0, 13);
    if (buckets.has(k)) buckets.set(k, buckets.get(k)! + 1);
  }

  const total = groups.reduce((a: number, g: { status: string; _count: number }) => a + g._count, 0);
  const by = Object.fromEntries(groups.map((g: { status: string; _count: number }) => [g.status, g._count]));
  const done = (by.sent ?? 0) + (by.failed ?? 0);

  res.json({
    queue,
    byStatus: by,
    total,
    successRate: done ? Math.round(((by.sent ?? 0) / done) * 1000) / 10 : null,
    perHour: [...buckets].map(([hour, count]) => ({ hour, count })),
    senders: await Promise.all(
      senders.map(async (s: Sender) => ({ email: s.email, used: await currentUsage(redis, s.id), limit: s.hourlyLimit })),
    ),
  });
});
