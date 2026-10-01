import { Router } from 'express';
import nodemailer from 'nodemailer';
import { config, currentUsage, encrypt, prisma, redis } from '@ejs/core';
import { uid } from '../auth';

export const sendersRouter = Router();

sendersRouter.get('/', async (req, res) => {
  const userId = uid(req);
  const senders = await prisma.sender.findMany({ where: { userId }, orderBy: { email: 'asc' } });
  res.json(
    await Promise.all(
      senders.map(async (s) => ({
        id: s.id, email: s.email, hourlyLimit: s.hourlyLimit, isActive: s.isActive,
        usedThisHour: await currentUsage(redis, s.id),
      })),
    ),
  );
});

/** Fail fast if the API/worker host cannot actually reach Ethereal's SMTP port. */
async function verifySmtp(user: string, pass: string) {
  const transport = nodemailer.createTransport({
    host: 'smtp.ethereal.email',
    port: 587,
    secure: false,
    auth: { user, pass },
    connectionTimeout: 10_000,
    greetingTimeout: 10_000,
  });
  await transport.verify();
}

/**
 * Register an Ethereal SMTP sender. With { user, pass } it uses the credentials you created at https://ethereal.email/create;
 * with no body it provisions a fresh account. Either way the SMTP login is verified so a blocked port or bad password
 * is reported now instead of emails silently never sending.
 */
sendersRouter.post('/ethereal', async (req, res) => {
  const userId = uid(req);
  let acct: { user: string; pass: string };
  try {
    acct = req.body?.user && req.body?.pass
      ? { user: String(req.body.user).trim(), pass: String(req.body.pass) }
      : await nodemailer.createTestAccount();
  } catch (err) {
    req.log.error({ err }, 'ethereal account creation failed');
    return void res.status(502).json({ error: `Could not create an Ethereal account from the server: ${(err as Error).message}` });
  }
  try {
    await verifySmtp(acct.user, acct.pass);
  } catch (err) {
    req.log.error({ err }, 'ethereal smtp verify failed');
    return void res.status(502).json({ error: `Could not log in to smtp.ethereal.email:587 (${(err as Error).message})` });
  }
  try {
    const s = await prisma.sender.create({
      data: {
        userId, email: acct.user, etherealUser: acct.user, etherealPassEnc: encrypt(acct.pass),
        hourlyLimit: Number(req.body?.hourlyLimit ?? config.maxEmailsPerHourPerSender),
      },
    });
    res.status(201).json({ id: s.id, email: s.email, hourlyLimit: s.hourlyLimit });
  } catch (err) {
    req.log.error({ err }, 'sender save failed');
    res.status(500).json({ error: `Could not save sender: ${(err as Error).message}` });
  }
});

sendersRouter.patch('/:id', async (req, res) => {
  const userId = uid(req);
  const s = await prisma.sender.findFirst({ where: { id: String(req.params.id), userId } });
  if (!s) return void res.status(404).json({ error: 'not found' });
  const data: { hourlyLimit?: number; isActive?: boolean } = {};
  if (typeof req.body.hourlyLimit === 'number') data.hourlyLimit = req.body.hourlyLimit;
  if (typeof req.body.isActive === 'boolean') data.isActive = req.body.isActive;
  res.json(await prisma.sender.update({ where: { id: s.id }, data, select: { id: true, email: true, hourlyLimit: true, isActive: true } }));
});

export const suppressionsRouter = Router();

suppressionsRouter.get('/', async (req, res) => {
  res.json(await prisma.suppression.findMany({ where: { userId: uid(req) }, orderBy: { createdAt: 'desc' } }));
});
suppressionsRouter.post('/', async (req, res) => {
  const userId = uid(req);
  const email = String(req.body.email ?? '').toLowerCase().trim();
  if (!email.includes('@')) return void res.status(400).json({ error: 'invalid email' });
  res.status(201).json(
    await prisma.suppression.upsert({
      where: { userId_email: { userId, email } },
      update: {},
      create: { userId, email, reason: req.body.reason },
    }),
  );
});
suppressionsRouter.delete('/:id', async (req, res) => {
  await prisma.suppression.deleteMany({ where: { id: String(req.params.id), userId: uid(req) } });
  res.status(204).end();
});
