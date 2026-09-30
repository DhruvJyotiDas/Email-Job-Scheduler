import { Client } from '@elastic/elasticsearch';
import { config } from './config';
import { prisma } from './db';
import { logger } from './logger';

// Short timeouts: an ES outage must never stall the send path.
export const es = new Client({
  node: config.esUrl,
  ...(config.esApiKey ? { auth: { apiKey: config.esApiKey } } : {}),
  requestTimeout: 3000,
  maxRetries: 1,
});
export const EMAIL_INDEX = 'emails';

export async function ensureIndex() {
  const exists = await es.indices.exists({ index: EMAIL_INDEX });
  if (exists) return;
  await es.indices.create({
    index: EMAIL_INDEX,
    mappings: {
      properties: {
        userId: { type: 'keyword' },
        campaignId: { type: 'keyword' },
        senderEmail: { type: 'keyword' },
        status: { type: 'keyword' },
        recipient: { type: 'text', fields: { raw: { type: 'keyword' } } },
        subject: { type: 'text' },
        body: { type: 'text' },
        scheduledAt: { type: 'date' },
        sentAt: { type: 'date' },
      },
    },
  });
}

/** Upsert the ES doc for an email from its DB row. Never throws: search is not on the send path. */
export async function indexEmail(emailId: string) {
  try {
    const e = await prisma.email.findUnique({ where: { id: emailId }, include: { campaign: true, sender: true } });
    if (!e) return;
    await es.index({
      index: EMAIL_INDEX,
      id: e.id,
      document: {
        userId: e.campaign.userId,
        campaignId: e.campaignId,
        senderEmail: e.sender?.email ?? null,
        status: e.status,
        recipient: e.recipient,
        subject: e.subjectRendered ?? e.campaign.subject,
        body: (e.bodyRendered ?? e.campaign.bodyTemplate).replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim(),
        scheduledAt: e.scheduledAt,
        sentAt: e.sentAt,
      },
    });
  } catch (err) {
    logger.warn({ err, emailId }, 'es index failed');
  }
}
