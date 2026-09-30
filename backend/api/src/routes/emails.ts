import { Router } from 'express';
import { EMAIL_INDEX, es, prisma } from '@ejs/core';
import { uid } from '../auth';

export const emailsRouter = Router();

const SCHEDULED = ['scheduled', 'sending', 'delayed_ratelimit'] as const;
const SENT = ['sent', 'failed', 'suppressed'] as const;
const statusesFor = (tab: unknown) => (tab === 'sent' ? [...SENT] : [...SCHEDULED]);

const strip = (html: string) => html.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim();

function shape(e: any) {
  const body = e.bodyRendered ?? e.campaign.bodyTemplate;
  return {
    id: e.id,
    recipient: e.recipient,
    subject: e.subjectRendered ?? e.campaign.subject,
    preview: strip(body).slice(0, 140),
    status: e.status,
    scheduledAt: e.scheduledAt,
    sentAt: e.sentAt,
    senderEmail: e.sender?.email ?? null,
    starred: e.starred,
    error: e.error,
  };
}

emailsRouter.get('/', async (req, res) => {
  const userId = uid(req);
  const take = Math.min(Number(req.query.limit ?? 50), 200);
  const skip = Number(req.query.offset ?? 0);
  const rows = await prisma.email.findMany({
    where: { campaign: { userId }, status: { in: statusesFor(req.query.tab) } },
    include: { campaign: true, sender: true },
    orderBy: req.query.tab === 'sent' ? { sentAt: 'desc' } : { scheduledAt: 'asc' },
    take,
    skip,
  });
  res.json(rows.map(shape));
});

emailsRouter.get('/counts', async (req, res) => {
  const userId = uid(req);
  const [scheduled, sent] = await Promise.all([
    prisma.email.count({ where: { campaign: { userId }, status: { in: [...SCHEDULED] } } }),
    prisma.email.count({ where: { campaign: { userId }, status: { in: [...SENT] } } }),
  ]);
  res.json({ scheduled, sent });
});

/** Onebox-style search: Elasticsearch multi_match + highlight, falling back to Postgres if ES is down. */
emailsRouter.get('/search', async (req, res) => {
  const userId = uid(req);
  const q = String(req.query.q ?? '').trim();
  const statuses = statusesFor(req.query.tab);
  if (!q) return void res.json([]);
  try {
    const r = await es.search({
      index: EMAIL_INDEX,
      size: 50,
      query: {
        bool: {
          must: [{ multi_match: { query: q, fields: ['subject^2', 'body', 'recipient'], fuzziness: 'AUTO' } }],
          filter: [{ term: { userId } }, { terms: { status: statuses } }],
        },
      },
      highlight: { encoder: 'html', fields:{ subject: {}, body: {}, recipient: {} }, pre_tags: ['<mark>'], post_tags: ['</mark>'] },
    });
    const ids = r.hits.hits.map((h) => h._id!);
    const rows = await prisma.email.findMany({ where: { id: { in: ids } }, include: { campaign: true, sender: true } });
    const byId = new Map(rows.map((x) => [x.id, x]));
    return void res.json(
      r.hits.hits.filter((h) => byId.has(h._id!)).map((h) => ({ ...shape(byId.get(h._id!)), highlight: h.highlight ?? {} })),
    );
  } catch {
    const rows = await prisma.email.findMany({
      where: {
        campaign: { userId },
        status: { in: statuses },
        OR: [
          { recipient: { contains: q, mode: 'insensitive' } },
          { campaign: { subject: { contains: q, mode: 'insensitive' } } },
        ],
      },
      include: { campaign: true, sender: true },
      take: 50,
    });
    res.json(rows.map(shape));
  }
});

emailsRouter.get('/:id', async (req, res) => {
  const userId = uid(req);
  const e = await prisma.email.findFirst({ where: { id: String(req.params.id), campaign: { userId } }, include: { campaign: true, sender: true } });
  if (!e) return void res.status(404).json({ error: 'not found' });
  res.json({ ...shape(e), body: e.bodyRendered ?? e.campaign.bodyTemplate, previewUrl: e.previewUrl });
});

emailsRouter.patch('/:id/star', async (req, res) => {
  const userId = uid(req);
  const e = await prisma.email.findFirst({ where: { id: String(req.params.id), campaign: { userId } } });
  if (!e) return void res.status(404).json({ error: 'not found' });
  const u = await prisma.email.update({ where: { id: e.id }, data: { starred: !e.starred } });
  res.json({ starred: u.starred });
});
