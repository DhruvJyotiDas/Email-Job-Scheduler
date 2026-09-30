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

/** Provision a fresh Ethereal SMTP account and register it as a sender. */
sendersRouter.post('/ethereal', async (req, res) => {
  const userId = uid(req);
  const acct = await nodemailer.createTestAccount();
  const s = await prisma.sender.create({
    data: {
      userId, email: acct.user, etherealUser: acct.user, etherealPassEnc: encrypt(acct.pass),
      hourlyLimit: Number(req.body?.hourlyLimit ?? config.maxEmailsPerHourPerSender),
    },
  });
  res.status(201).json({ id: s.id, email: s.email, hourlyLimit: s.hourlyLimit });
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
